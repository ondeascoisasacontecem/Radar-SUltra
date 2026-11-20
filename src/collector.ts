// Coleta agendada: cache HTTP, robots.txt, recuo exponencial, Retry-After, deduplicação de alertas no banco.
import { EventEmitter } from 'node:events';
import { Db } from './db.ts';
import { evaluate, alertText, isQuiet } from './alerts.ts';
import { MODELS, type ModelId } from './catalog.ts';
import { HttpError, type Source, type SourceCtx } from './sources/types.ts';

const UA = 'RadarSUltra/1.0 (monitor pessoal de precos; uso nao comercial)';
const MAX_BACKOFF = 12 * 3600_000;

/** Devolve quantos dispositivos receberam (0 = nenhum inscrito). Lança erro se todos falharam. */
export type Pusher = (alert: { id: number; title: string; body: string; url: string | null }) => Promise<number | void>;

export class Collector extends EventEmitter {
  private robots = new Map<string, { at: number; disallow: RegExp[] }>();
  private lastHostHit = new Map<string, number>();
  db: Db; sources: Source[]; push: Pusher; now: () => number;
  private fetchImpl: typeof fetch; private politeDelayMs: number;
  constructor(db: Db, sources: Source[], push: Pusher, now: () => number = Date.now, fetchImpl: typeof fetch = fetch, politeDelayMs = 2000) {
    super();
    this.db = db; this.sources = sources; this.push = push; this.now = now; this.fetchImpl = fetchImpl; this.politeDelayMs = politeDelayMs;
  }

  private async allowed(url: string): Promise<boolean> {
    const u = new URL(url);
    if (u.hostname.startsWith('api.')) return true; // APIs oficiais seguem os próprios termos/cotas
    let r = this.robots.get(u.host);
    if (!r || this.now() - r.at > 86_400_000) {
      const disallow: RegExp[] = [];
      try {
        const txt = await (await this.fetchImpl(`${u.origin}/robots.txt`, { headers: { 'user-agent': UA } })).text();
        let applies = false;
        for (const line of txt.split(/\r?\n/)) {
          const [k, ...v] = line.split(':'); const val = v.join(':').trim();
          if (/^user-agent$/i.test(k.trim())) applies = val === '*' || /radarsultra/i.test(val);
          else if (applies && /^disallow$/i.test(k.trim()) && val) {
            disallow.push(new RegExp('^' + val.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')));
          }
        }
      } catch { /* sem robots: segue com cautela de intervalo */ }
      r = { at: this.now(), disallow }; this.robots.set(u.host, r);
    }
    const path = u.pathname + u.search;
    return !r.disallow.some(re => re.test(path));
  }

  async fetchText(url: string, o: { fresh?: boolean; headers?: Record<string, string> } = {}): Promise<string> {
    if (!(await this.allowed(url))) throw new Error(`robots.txt não permite ${new URL(url).pathname}`);
    const host = new URL(url).host;
    const wait = (this.lastHostHit.get(host) ?? 0) + this.politeDelayMs - Date.now();
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    this.lastHostHit.set(host, Date.now());
    const cached = this.db.cacheGet(url);
    const headers: Record<string, string> = { 'user-agent': UA, 'accept-language': 'pt-BR', ...o.headers };
    if (cached?.etag) headers['if-none-match'] = cached.etag;
    if (cached?.last_modified) headers['if-modified-since'] = cached.last_modified;
    const res = await this.fetchImpl(url, { headers, signal: AbortSignal.timeout(30_000) });
    if (res.status === 304 && cached) return cached.body;
    if (!res.ok) {
      const ra = res.headers.get('retry-after');
      const raMs = ra ? (/^\d+$/.test(ra) ? Number(ra) * 1000 : Math.max(0, Date.parse(ra) - this.now())) : null;
      throw new HttpError(res.status, raMs, url);
    }
    const body = await res.text();
    this.db.cachePut(url, res.headers.get('etag'), res.headers.get('last-modified'), body, this.now());
    return body;
  }

  /** Modelos com regra ativa ou favorito vêm primeiro (lista de interesse); pausados ficam fora. */
  interestModels(): ModelId[] {
    const paused = new Set(this.db.settings().pausedModels);
    const hot = new Set<string>(this.db.rules().filter(r => !r.paused).map(r => r.model));
    for (const k of this.db.favorites()) hot.add(k.split('|')[3]);
    const all = (Object.keys(MODELS) as ModelId[]).filter(m => !paused.has(m));
    return [...all.filter(m => hot.has(m)), ...all.filter(m => !hot.has(m))];
  }

  async runSource(src: Source, force = false): Promise<{ ok: boolean; count: number; error?: string }> {
    const now = this.now();
    const st = this.db.sourceStatus(src.id);
    const ready = src.ready();
    if (ready !== true) {
      this.db.saveSourceStatus({ source: src.id, last_ok: st?.last_ok ?? null, last_attempt: now, last_error: ready, fail_count: 0, next_at: now + src.intervalMin * 60_000, last_latency_ms: null, last_count: null });
      return { ok: false, count: 0, error: ready };
    }
    if (!force && st?.next_at && now < st.next_at) return { ok: true, count: 0 };
    const t0 = Date.now();
    const ctx: SourceCtx = { models: this.interestModels(), now: this.now, fetchText: (u, o) => this.fetchText(u, o) };
    try {
      const found = await src.collect(ctx);
      const touched = new Set<string>();
      for (const f of found) { this.db.upsertOffer(f.offer); this.db.addObservation(f.offer.key, f.obs); touched.add(f.offer.key); }
      this.db.saveSourceStatus({ source: src.id, last_ok: this.now(), last_attempt: now, last_error: null, fail_count: 0, next_at: now + src.intervalMin * 60_000, last_latency_ms: Date.now() - t0, last_count: found.length });
      await this.evaluateAlerts([...touched]);
      this.emit('update', { source: src.id, count: found.length });
      return { ok: true, count: found.length };
    } catch (e: any) {
      // Falha NÃO gera observação: o último preço fica, marcado como desatualizado pela UI.
      const fails = (st?.fail_count ?? 0) + 1;
      let delay = Math.min(src.intervalMin * 60_000 * 2 ** (fails - 1), MAX_BACKOFF);
      if (e instanceof HttpError && e.retryAfterMs !== null) delay = Math.max(delay, e.retryAfterMs);
      this.db.saveSourceStatus({ source: src.id, last_ok: st?.last_ok ?? null, last_attempt: now, last_error: String(e.message ?? e), fail_count: fails, next_at: now + delay, last_latency_ms: Date.now() - t0, last_count: null });
      this.emit('update', { source: src.id, error: String(e.message ?? e) });
      return { ok: false, count: 0, error: String(e.message ?? e) };
    }
  }

  async evaluateAlerts(keys: string[]) {
    const s = this.db.settings();
    const paused = new Set(s.pausedModels);
    const rules = this.db.rules().filter(r => !paused.has(r.model));
    const now = this.now();
    for (const key of keys) {
      const offer = this.db.offer(key);
      if (!offer || offer.isDemo) continue;
      const rows = this.db.observations(key);
      for (const r of rules) for (const ev of evaluate(r, offer, rows, now, s)) {
        const t = alertText(ev, offer, now);
        this.db.insertAlert({ dedupeKey: ev.dedupeKey, createdAt: now, offerKey: key, ...t });
      }
    }
    await this.flushPush();
  }

  /** Envia alertas pendentes; em horário silencioso ficam na central e saem depois. */
  async flushPush() {
    if (isQuiet(this.now(), this.db.settings())) return;
    for (const a of this.db.unpushedAlerts()) {
      try { const n = await this.push({ id: a.id, title: a.title, body: a.body, url: a.url }); this.db.markPushed(a.id, n === 0 ? 2 : 1); }
      catch { /* tenta no próximo ciclo */ }
    }
  }

  async tick(force = false) {
    for (const s of this.sources) await this.runSource(s, force);
    await this.flushPush();
  }

  start(everyMs = 60_000) {
    const loop = () => this.tick().catch(e => console.error('[coletor]', e)).finally(() => { timer = setTimeout(loop, everyMs); });
    let timer = setTimeout(loop, 1000);
    return () => clearTimeout(timer);
  }
}

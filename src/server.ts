// API + arquivos da PWA + SSE (atualização incremental da tela após cada coleta).
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Db } from './db.ts';
import type { Collector } from './collector.ts';
import { listOffers, offerView } from './view.ts';
import { manualFound, olxSearchUrl } from './manual.ts';
import { MODELS, type ModelId } from './catalog.ts';
import { SOURCES_MATRIX } from './matrix.ts';

const PUBLIC = fileURLToPath(new URL('../public/', import.meta.url));
const MIME: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };

async function body(req: IncomingMessage): Promise<any> {
  let s = ''; for await (const c of req) { s += c; if (s.length > 100_000) throw new Error('corpo grande demais'); }
  return s ? JSON.parse(s) : {};
}
const json = (res: ServerResponse, code: number, data: unknown) => {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(data));
};

export function startServer(db: Db, collector: Collector, vapidPublic: string, opts: { port: number; host: string; demo: boolean; now: () => number }) {
  const clients = new Set<ServerResponse>();
  collector.on('update', (e) => { for (const c of clients) c.write(`event: update\ndata: ${JSON.stringify(e)}\n\n`); });

  const server = createServer(async (req, res) => {
    try {
      const u = new URL(req.url ?? '/', 'http://x');
      const p = u.pathname, m = req.method ?? 'GET';
      const now = opts.now();
      if (p === '/api/events') {
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
        res.write(': ok\n\n'); clients.add(res); req.on('close', () => clients.delete(res)); return;
      }
      if (p === '/api/offers') return json(res, 200, listOffers(db, {
        model: u.searchParams.get('model') || undefined, condition: u.searchParams.get('condition') || undefined,
        delivery: u.searchParams.get('delivery') || undefined, sort: (u.searchParams.get('sort') as any) || undefined,
        favorites: u.searchParams.get('favorites') === '1', demo: opts.demo || u.searchParams.get('demo') === '1',
      }, now));
      if (p === '/api/offer') {
        const o = db.offer(u.searchParams.get('key') ?? '');
        if (!o) return json(res, 404, { error: 'Oferta não encontrada' });
        const ok = new Map(db.allSourceStatus().map(s => [s.source, s.last_ok]));
        return json(res, 200, offerView(db, o, now, db.favorites(), ok, true));
      }
      if (p === '/api/meta') return json(res, 200, {
        models: Object.entries(MODELS).map(([id, v]) => ({ id, ...v,
          olx: { RR: olxSearchUrl(id as ModelId, 'RR'), BR: olxSearchUrl(id as ModelId, 'BR') } })),
        sources: SOURCES_MATRIX, status: db.allSourceStatus(), vapidPublic, settings: db.settings(),
        devices: db.pushSubs().map(s => ({ label: s.label, endpointTail: s.endpoint.slice(-12), createdAt: s.created_at, lastOk: s.last_ok, lastError: s.last_error })),
      });
      if (p === '/api/favorite' && m === 'POST') return json(res, 200, { favorite: db.toggleFavorite((await body(req)).key) });
      if (p === '/api/settings' && m === 'POST') { db.saveSettings(await body(req)); return json(res, 200, db.settings()); }
      if (p === '/api/rules' && m === 'GET') return json(res, 200, db.rules());
      if (p === '/api/rules' && m === 'POST') {
        const r = await body(req);
        if (!MODELS[r.model as ModelId]) return json(res, 400, { error: 'Modelo inválido' });
        return json(res, 200, { id: db.saveRule(r) });
      }
      if (p === '/api/rules' && m === 'DELETE') { db.deleteRule(Number(u.searchParams.get('id'))); return json(res, 200, { ok: true }); }
      if (p === '/api/alerts' && m === 'GET') return json(res, 200, db.alerts());
      if (p === '/api/alerts/read' && m === 'POST') { db.markAllRead(); return json(res, 200, { ok: true }); }
      if (p === '/api/alerts/test' && m === 'POST') {
        const id = db.insertAlert({ dedupeKey: `teste|${now}`, createdAt: now, offerKey: null, isTest: true,
          title: '🔔 Teste: Galaxy S25 Ultra · 256 GB · Novo — R$ 4.499,00 no Pix',
          body: 'Alerta de TESTE · Loja exemplo · antes R$ 4.899,00 · preço observado há 47 min', url: '/#alertas' });
        await collector.flushPush();
        const subs = db.pushSubs();
        return json(res, 200, { id, devices: subs.length, results: subs.map(s => ({ label: s.label, lastOk: s.last_ok, lastError: s.last_error })) });
      }
      if (p === '/api/push/subscribe' && m === 'POST') {
        const b = await body(req); db.savePushSub(b.subscription, String(b.label ?? 'dispositivo').slice(0, 60), now); return json(res, 200, { ok: true });
      }
      if (p === '/api/push/unsubscribe' && m === 'POST') { db.deletePushSub((await body(req)).endpoint); return json(res, 200, { ok: true }); }
      if (p === '/api/manual' && m === 'POST') {
        const f = manualFound(await body(req), now);
        if ('error' in f) return json(res, 400, f);
        db.upsertOffer(f.offer, true); db.addObservation(f.offer.key, f.obs);
        db.saveSourceStatus({ source: f.offer.source, last_ok: now, last_attempt: now, last_error: null, fail_count: 0, next_at: 0, last_latency_ms: null, last_count: 1 });
        await collector.evaluateAlerts([f.offer.key]); collector.emit('update', { source: f.offer.source, count: 1 });
        return json(res, 200, { key: f.offer.key, origin: f.offer.origin });
      }
      if (p === '/api/origin' && m === 'POST') {
        const b = await body(req);
        if (!b.evidence?.trim()) return json(res, 400, { error: 'Descreva a evidência (ex.: "Envio de Manaus/AM" na página).' });
        db.setOrigin(b.key, b.origin === 'internacional' ? 'internacional' : 'nacional', `${b.evidence.trim()} · confirmado manualmente`, b.url || null, now);
        await collector.evaluateAlerts([b.key]); return json(res, 200, { ok: true });
      }
      if (p === '/api/collect' && m === 'POST') { collector.tick(true).catch(() => {}); return json(res, 202, { ok: true }); }

      // Arquivos estáticos
      const file = normalize(join(PUBLIC, p === '/' ? 'index.html' : p));
      if (!file.startsWith(normalize(PUBLIC))) return json(res, 403, { error: 'proibido' });
      try {
        const data = await readFile(file);
        res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-cache' }); // revalida sempre; o SW cuida do offline
        res.end(data);
      } catch { json(res, 404, { error: 'não encontrado' }); }
    } catch (e: any) { json(res, 500, { error: String(e?.message ?? e) }); }
  });
  server.listen(opts.port, opts.host);
  return server;
}

// Persistência SQLite (node:sqlite, sem dependência nativa). Centavos e UTC em ms.
import { DatabaseSync } from 'node:sqlite';
import type { Offer, ObsRow, Rule, Settings } from './types.ts';

const SCHEMA = `
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS offers (
  key TEXT PRIMARY KEY, source TEXT NOT NULL, listing_id TEXT NOT NULL, url TEXT NOT NULL, title TEXT NOT NULL,
  model TEXT NOT NULL, storage_gb INTEGER, ram_gb INTEGER, version TEXT, condition TEXT NOT NULL, seller TEXT,
  region TEXT, origin TEXT NOT NULL, origin_evidence TEXT, origin_url TEXT, origin_checked_at INTEGER, warranty TEXT,
  is_demo INTEGER NOT NULL DEFAULT 0, first_seen INTEGER NOT NULL, published_at INTEGER, lead_url TEXT, lead_posted_at INTEGER,
  manual INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS observations (
  id INTEGER PRIMARY KEY, offer_key TEXT NOT NULL REFERENCES offers(key), ts INTEGER NOT NULL,
  pix_cents INTEGER, card_total_cents INTEGER, installments INTEGER, installment_cents INTEGER, list_price_cents INTEGER,
  coupon_code TEXT, coupon_price_cents INTEGER, coupon_req TEXT, shipping_cents INTEGER, cashback_cents INTEGER,
  available INTEGER NOT NULL, promo_start_ts INTEGER, UNIQUE(offer_key, ts)
);
CREATE INDEX IF NOT EXISTS obs_offer_ts ON observations(offer_key, ts);
CREATE TABLE IF NOT EXISTS source_status (
  source TEXT PRIMARY KEY, last_ok INTEGER, last_attempt INTEGER, last_error TEXT, fail_count INTEGER NOT NULL DEFAULT 0,
  next_at INTEGER, last_latency_ms INTEGER, last_count INTEGER
);
CREATE TABLE IF NOT EXISTS http_cache (url TEXT PRIMARY KEY, etag TEXT, last_modified TEXT, body TEXT, fetched_at INTEGER);
CREATE TABLE IF NOT EXISTS rules (id INTEGER PRIMARY KEY, json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY, dedupe_key TEXT UNIQUE NOT NULL, created_at INTEGER NOT NULL, offer_key TEXT,
  title TEXT NOT NULL, body TEXT NOT NULL, url TEXT, pushed INTEGER NOT NULL DEFAULT 0, read INTEGER NOT NULL DEFAULT 0, is_test INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS push_subs (endpoint TEXT PRIMARY KEY, json TEXT NOT NULL, label TEXT, created_at INTEGER, last_ok INTEGER, last_error TEXT);
CREATE TABLE IF NOT EXISTS favorites (offer_key TEXT PRIMARY KEY);
CREATE TABLE IF NOT EXISTS settings (k TEXT PRIMARY KEY, v TEXT NOT NULL);
`;

export const DEFAULT_SETTINGS: Settings = {
  eligibleCoupons: [], quietStart: null, quietEnd: null, gapHours: 6, staleHours: 3, cep: '69301-000',
};

const b = (v: unknown) => (v ? 1 : 0);

export class Db {
  db: DatabaseSync;
  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(SCHEMA);
  }
  close() { this.db.close(); }

  upsertOffer(o: Offer, manual = false) {
    this.db.prepare(`INSERT INTO offers VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(key) DO UPDATE SET url=excluded.url, title=excluded.title, origin=CASE WHEN offers.manual=1 AND offers.origin='nacional' THEN offers.origin ELSE excluded.origin END,
      origin_evidence=COALESCE(excluded.origin_evidence, offers.origin_evidence), origin_url=COALESCE(excluded.origin_url, offers.origin_url),
      origin_checked_at=COALESCE(excluded.origin_checked_at, offers.origin_checked_at), warranty=COALESCE(excluded.warranty, offers.warranty),
      published_at=COALESCE(offers.published_at, excluded.published_at), lead_url=COALESCE(excluded.lead_url, offers.lead_url),
      lead_posted_at=COALESCE(excluded.lead_posted_at, offers.lead_posted_at)`).run(
      o.key, o.source, o.listingId, o.url, o.title, o.model, o.storageGb, o.ramGb, o.version, o.condition, o.seller, o.region,
      o.origin, o.originEvidence, o.originUrl, o.originCheckedAt, o.warranty, b(o.isDemo), o.firstSeen, o.publishedAt,
      o.leadUrl, o.leadPostedAt, b(manual));
  }

  setOrigin(key: string, origin: string, evidence: string, url: string | null, at: number) {
    this.db.prepare('UPDATE offers SET origin=?, origin_evidence=?, origin_url=?, origin_checked_at=?, manual=1 WHERE key=?')
      .run(origin, evidence, url, at, key);
  }

  addObservation(key: string, o: ObsRow) {
    this.db.prepare(`INSERT OR IGNORE INTO observations
      (offer_key, ts, pix_cents, card_total_cents, installments, installment_cents, list_price_cents, coupon_code, coupon_price_cents,
       coupon_req, shipping_cents, cashback_cents, available, promo_start_ts) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      key, o.ts, o.pixCents, o.cardTotalCents, o.installments, o.installmentCents, o.listPriceCents, o.couponCode,
      o.couponPriceCents, o.couponReq, o.shippingCents, o.cashbackCents, b(o.available), o.promoStartTs);
  }

  offers(includeDemo: boolean): Offer[] {
    return (this.db.prepare(`SELECT * FROM offers ${includeDemo ? '' : 'WHERE is_demo=0'}`).all() as any[]).map(rowToOffer);
  }
  offer(key: string): Offer | null {
    const r = this.db.prepare('SELECT * FROM offers WHERE key=?').get(key);
    return r ? rowToOffer(r) : null;
  }
  observations(key: string): ObsRow[] {
    return (this.db.prepare('SELECT * FROM observations WHERE offer_key=? ORDER BY ts').all(key) as any[]).map(r => ({
      ts: r.ts, pixCents: r.pix_cents, cardTotalCents: r.card_total_cents, installments: r.installments,
      installmentCents: r.installment_cents, listPriceCents: r.list_price_cents, couponCode: r.coupon_code,
      couponPriceCents: r.coupon_price_cents, couponReq: r.coupon_req, shippingCents: r.shipping_cents,
      cashbackCents: r.cashback_cents, available: !!r.available, promoStartTs: r.promo_start_ts,
    }));
  }

  // --- fontes
  sourceStatus(source: string): any { return this.db.prepare('SELECT * FROM source_status WHERE source=?').get(source) ?? null; }
  allSourceStatus(): any[] { return this.db.prepare('SELECT * FROM source_status').all() as any[]; }
  saveSourceStatus(s: { source: string; last_ok: number | null; last_attempt: number; last_error: string | null; fail_count: number; next_at: number; last_latency_ms: number | null; last_count: number | null }) {
    this.db.prepare(`INSERT INTO source_status VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(source) DO UPDATE SET
      last_ok=excluded.last_ok, last_attempt=excluded.last_attempt, last_error=excluded.last_error, fail_count=excluded.fail_count,
      next_at=excluded.next_at, last_latency_ms=excluded.last_latency_ms, last_count=excluded.last_count`)
      .run(s.source, s.last_ok, s.last_attempt, s.last_error, s.fail_count, s.next_at, s.last_latency_ms, s.last_count);
  }
  cacheGet(url: string): any { return this.db.prepare('SELECT * FROM http_cache WHERE url=?').get(url) ?? null; }
  cachePut(url: string, etag: string | null, lm: string | null, body: string, at: number) {
    this.db.prepare('INSERT OR REPLACE INTO http_cache VALUES (?,?,?,?,?)').run(url, etag, lm, body, at);
  }

  // --- regras, alertas, push, favoritos, ajustes
  rules(): Rule[] { return (this.db.prepare('SELECT id, json FROM rules ORDER BY id').all() as any[]).map(r => ({ ...JSON.parse(r.json), id: r.id })); }
  saveRule(r: Omit<Rule, 'id'> & { id?: number }): number {
    const { id, ...rest } = r;
    if (id) { this.db.prepare('UPDATE rules SET json=? WHERE id=?').run(JSON.stringify(rest), id); return id; }
    return Number(this.db.prepare('INSERT INTO rules (json) VALUES (?)').run(JSON.stringify(rest)).lastInsertRowid);
  }
  deleteRule(id: number) { this.db.prepare('DELETE FROM rules WHERE id=?').run(id); }

  /** true se o alerta é novo. A UNIQUE(dedupe_key) garante deduplicação também após reinício. */
  insertAlert(a: { dedupeKey: string; createdAt: number; offerKey: string | null; title: string; body: string; url: string | null; isTest?: boolean }): number | null {
    const r = this.db.prepare(`INSERT OR IGNORE INTO alerts (dedupe_key, created_at, offer_key, title, body, url, is_test) VALUES (?,?,?,?,?,?,?)`)
      .run(a.dedupeKey, a.createdAt, a.offerKey, a.title, a.body, a.url, b(a.isTest));
    return r.changes ? Number(r.lastInsertRowid) : null;
  }
  alerts(limit = 100): any[] { return this.db.prepare('SELECT * FROM alerts ORDER BY created_at DESC LIMIT ?').all(limit) as any[]; }
  unpushedAlerts(): any[] { return this.db.prepare('SELECT * FROM alerts WHERE pushed=0 ORDER BY created_at').all() as any[]; }
  /** pushed: 0 pendente · 1 enviado a dispositivo · 2 sem dispositivo inscrito (só central) */
  markPushed(id: number, v = 1) { this.db.prepare('UPDATE alerts SET pushed=? WHERE id=?').run(v, id); }
  markAllRead() { this.db.prepare('UPDATE alerts SET read=1').run(); }

  pushSubs(): any[] { return this.db.prepare('SELECT * FROM push_subs').all() as any[]; }
  savePushSub(sub: any, label: string, at: number) {
    this.db.prepare('INSERT OR REPLACE INTO push_subs (endpoint, json, label, created_at) VALUES (?,?,?,?)').run(sub.endpoint, JSON.stringify(sub), label, at);
  }
  deletePushSub(endpoint: string) { this.db.prepare('DELETE FROM push_subs WHERE endpoint=?').run(endpoint); }
  pushResult(endpoint: string, ok: boolean, err: string | null, at: number) {
    this.db.prepare(ok ? 'UPDATE push_subs SET last_ok=?, last_error=NULL WHERE endpoint=?' : 'UPDATE push_subs SET last_error=? WHERE endpoint=?')
      .run(ok ? at : `${new Date(at).toISOString()} ${err}`, endpoint);
  }

  favorites(): Set<string> { return new Set((this.db.prepare('SELECT offer_key FROM favorites').all() as any[]).map(r => r.offer_key)); }
  toggleFavorite(key: string): boolean {
    if (this.db.prepare('DELETE FROM favorites WHERE offer_key=?').run(key).changes) return false;
    this.db.prepare('INSERT INTO favorites VALUES (?)').run(key); return true;
  }

  settings(): Settings & { pausedModels: string[] } {
    const out: any = { ...DEFAULT_SETTINGS, pausedModels: [] };
    for (const r of this.db.prepare('SELECT k, v FROM settings').all() as any[]) out[r.k] = JSON.parse(r.v);
    return out;
  }
  saveSettings(s: Record<string, unknown>) {
    const st = this.db.prepare('INSERT OR REPLACE INTO settings VALUES (?,?)');
    for (const [k, v] of Object.entries(s)) if (k in DEFAULT_SETTINGS || k === 'pausedModels') st.run(k, JSON.stringify(v));
  }
}

function rowToOffer(r: any): Offer {
  return {
    key: r.key, source: r.source, listingId: r.listing_id, url: r.url, title: r.title, model: r.model, storageGb: r.storage_gb,
    ramGb: r.ram_gb, version: r.version, condition: r.condition, seller: r.seller, region: r.region, origin: r.origin,
    originEvidence: r.origin_evidence, originUrl: r.origin_url, originCheckedAt: r.origin_checked_at, warranty: r.warranty,
    isDemo: !!r.is_demo, firstSeen: r.first_seen, publishedAt: r.published_at, leadUrl: r.lead_url, leadPostedAt: r.lead_posted_at,
  };
}

export function offerKey(source: string, listingId: string, seller: string | null, model: string, storageGb: number | null, condition: string, version: string | null = null) {
  return [source, listingId, (seller ?? '?').toLowerCase(), model, storageGb ?? '?', version ?? '-', condition].join('|');
}

// Avaliação de regras de alerta. Função pura: mesma entrada ⇒ mesma chave de deduplicação.
import { summarize, type Obs, type Summary } from './history.ts';
import { MODELS } from './catalog.ts';
import { formatAge, formatBRL, formatPct, formatTimeBV, TZ } from './format.ts';
import type { Offer, ObsRow, Payment, Rule, Settings } from './types.ts';

export interface AlertEvent {
  kind: 'alvo' | 'queda' | 'minimo';
  dedupeKey: string;
  ruleId: number;
  offerKey: string;
  payment: Payment;
  priceCents: number;
  previousCents: number | null;
  dropProven: boolean;
  observedSince: number;
  checkedAt: number;
}

export function couponEligible(o: ObsRow, s: Settings): boolean {
  return o.couponPriceCents !== null && (o.couponReq === null || s.eligibleCoupons.includes(o.couponReq));
}

/** Converte observações na série de preço que vale PARA ESTE USUÁRIO nesta modalidade. */
export function seriesFor(rows: ObsRow[], payment: Payment, s: Settings, withShipping: boolean): Obs[] {
  const out: Obs[] = [];
  for (const o of rows) {
    // Esgotado informado pela fonte entra na série (sem preço) para interromper o período.
    if (!o.available) { out.push({ ts: o.ts, priceCents: 0, available: false }); continue; }
    let p = payment === 'pix' ? o.pixCents : o.cardTotalCents;
    if (payment === 'pix' && couponEligible(o, s)) p = Math.min(p ?? Infinity, o.couponPriceCents!);
    if (p === null || !Number.isFinite(p)) continue;
    if (withShipping) {
      if (o.shippingCents === null) continue; // sem frete conhecido não dá para comparar total
      p += o.shippingCents;
    }
    out.push({ ts: o.ts, priceCents: p, available: o.available });
  }
  return out;
}

export function ruleMatches(r: Rule, offer: Offer): boolean {
  if (r.paused || offer.origin !== 'nacional') return false;
  if (r.model !== offer.model) return false;
  if (r.storageGb !== null && r.storageGb !== offer.storageGb) return false;
  if (!r.conditions.includes(offer.condition)) return false;
  if (r.version && r.version !== offer.version) return false;
  if (r.region === 'RR' && offer.region !== null && offer.region !== 'RR') return false;
  return true;
}

export function evaluate(r: Rule, offer: Offer, rows: ObsRow[], now: number, s: Settings): AlertEvent[] {
  if (!ruleMatches(r, offer)) return [];
  const series = seriesFor(rows, r.payment, s, r.includeShipping);
  const sum: Summary = summarize(series, now, { gapMs: s.gapHours * 3600_000, staleMs: s.staleHours * 3600_000 });
  const cur = sum.current;
  if (!cur || sum.stale) return [];
  const base = {
    ruleId: r.id, offerKey: offer.key, payment: r.payment, priceCents: cur.priceCents,
    previousCents: sum.previousPriceCents, dropProven: sum.dropProven, observedSince: cur.firstSeen, checkedAt: cur.lastSeen,
  };
  const key = (k: string) => `${r.id}|${offer.key}|${r.payment}|${k}|${cur.firstSeen}`;
  const ev: AlertEvent[] = [];
  // Alvo: só na ENTRADA na faixa (primeira vista ou vindo de cima do alvo). Oscilação dentro da faixa não re-alerta.
  const entered = r.targetCents !== null && (sum.previousPriceCents === null || sum.previousPriceCents > r.targetCents);
  if (r.targetCents !== null && cur.priceCents <= r.targetCents && entered) ev.push({ ...base, kind: 'alvo', dedupeKey: key('alvo') });
  if (sum.dropProven && sum.dropCents !== null &&
      ((r.minDropCents !== null && sum.dropCents >= r.minDropCents) || (r.minDropPct !== null && sum.dropPct! >= r.minDropPct))) {
    ev.push({ ...base, kind: 'queda', dedupeKey: key('queda') });
  }
  if (r.newLow) {
    const earlier = series.filter(o => o.ts < cur.firstSeen && o.available !== false);
    if (earlier.length && cur.priceCents < Math.min(...earlier.map(o => o.priceCents))) ev.push({ ...base, kind: 'minimo', dedupeKey: key('minimo') });
  }
  return ev;
}

function minutesBV(ts: number): number {
  const [h, m] = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .format(ts).split(':').map(Number);
  return h * 60 + m;
}
const toMin = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };

export function isQuiet(now: number, s: Settings): boolean {
  if (!s.quietStart || !s.quietEnd) return false;
  const n = minutesBV(now), a = toMin(s.quietStart), b = toMin(s.quietEnd);
  return a <= b ? n >= a && n < b : n >= a || n < b;
}

const KIND = { alvo: '🎯 Preço-alvo', queda: '↓ Queda', minimo: '★ Novo menor preço' } as const;
const COND = { novo: 'Novo', seminovo: 'Seminovo', usado: 'Usado', recondicionado: 'Recondicionado' } as const;

export function alertText(e: AlertEvent, offer: Offer, now: number): { title: string; body: string; url: string } {
  const variant = [MODELS[offer.model].name, offer.storageGb ? `${offer.storageGb >= 1024 ? offer.storageGb / 1024 + ' TB' : offer.storageGb + ' GB'}` : null, COND[offer.condition], offer.version ? `versão ${offer.version}` : null]
    .filter(Boolean).join(' · ');
  const pay = e.payment === 'pix' ? 'no Pix' : 'no cartão (total)';
  const parts = [`${offer.source}${offer.seller ? ' · ' + offer.seller : ''}`];
  if (e.previousCents !== null && e.previousCents > e.priceCents) {
    const d = e.previousCents - e.priceCents;
    parts.push(`antes ${formatBRL(e.previousCents)} (−${formatBRL(d)}, ${formatPct((d / e.previousCents) * 100)})${e.dropProven ? '' : ' · continuidade incerta'}`);
  }
  parts.push(`preço observado há ${formatAge(now - e.observedSince)}`, `verificado às ${formatTimeBV(e.checkedAt)}`);
  return { title: `${KIND[e.kind]}: ${variant} — ${formatBRL(e.priceCents)} ${pay}`, body: parts.join(' · '), url: offer.url };
}

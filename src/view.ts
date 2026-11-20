// Monta o que a tela precisa a partir do banco. Toda a lógica de histórico vem de history.ts.
import { summarize, buildPeriods } from './history.ts';
import { seriesFor, couponEligible } from './alerts.ts';
import { sortOffers, type Sort } from './ranking.ts';
import { MODELS } from './catalog.ts';
import type { Db } from './db.ts';
import type { Offer, Payment } from './types.ts';

export function offerView(db: Db, offer: Offer, now: number, favs: Set<string>, sourceOk: Map<string, number | null>, detail = false) {
  const s = db.settings();
  const o = { gapMs: s.gapHours * 3600_000, staleMs: s.staleHours * 3600_000 };
  const rows = db.observations(offer.key);
  const last = rows.at(-1);
  if (!last) return null;
  const sums = {} as Record<Payment, ReturnType<typeof summarize>>;
  for (const p of ['pix', 'cartao'] as Payment[]) sums[p] = summarize(seriesFor(rows, p, s, false), now, o);
  const head: Payment = last.pixCents !== null ? 'pix' : 'cartao';
  const sum = sums[head];
  const price = sum.current?.priceCents ?? null;
  const lastOk = sourceOk.get(offer.source) ?? null;
  const v: any = {
    ...offer, modelName: MODELS[offer.model].name, favorite: favs.has(offer.key),
    payment: head, priceCents: price, available: sum.available,
    previousCents: sum.previousPriceCents, dropCents: sum.dropCents, dropPct: sum.dropPct, dropProven: sum.dropProven,
    provenDropCents: sum.dropProven ? sum.dropCents : null, // ranking "maior queda comprovada"
    changeWindow: sum.changeWindow, observedSince: sum.observedSince, lastConfirmed: sum.lastConfirmed,
    continuityUncertain: sum.current?.continuityUncertain ?? false,
    stale: sum.stale, sourceLastOk: lastOk,
    min30: sum.min30, min90: sum.min90,
    pixCents: last.pixCents, cardTotalCents: last.cardTotalCents, installments: last.installments, installmentCents: last.installmentCents,
    listPriceCents: last.listPriceCents, couponCode: last.couponCode, couponPriceCents: last.couponPriceCents, couponReq: last.couponReq,
    couponEligible: couponEligible(last, s), shippingCents: last.shippingCents, cashbackCents: last.cashbackCents,
    totalCents: price !== null && last.shippingCents !== null ? price + last.shippingCents : null,
    promoStartTs: last.promoStartTs, cep: s.cep,
  };
  if (detail) {
    v.observations = rows;
    v.periods = { pix: buildPeriods(seriesFor(rows, 'pix', s, false), o.gapMs), cartao: buildPeriods(seriesFor(rows, 'cartao', s, false), o.gapMs) };
  }
  return v;
}

export function listOffers(db: Db, q: { model?: string; condition?: string; delivery?: string; sort?: Sort; favorites?: boolean; demo?: boolean }, now: number) {
  const favs = db.favorites();
  const status = db.allSourceStatus();
  const ok = new Map(status.map(s => [s.source, s.last_ok]));
  let items = db.offers(!!q.demo).map(o => offerView(db, o, now, favs, ok)).filter(Boolean) as any[];
  if (!q.demo) items = items.filter(i => !i.isDemo);
  if (q.model) items = items.filter(i => i.model === q.model);
  if (q.condition) items = items.filter(i => i.condition === q.condition);
  if (q.favorites) items = items.filter(i => i.favorite);
  const counts: Record<string, number> = {};
  for (const i of items) counts[i.origin] = (counts[i.origin] ?? 0) + 1;
  // Entrega: feed principal = só origem nacional comprovada.
  const delivery = q.delivery || 'nacional';
  if (delivery !== 'todas') items = items.filter(i => i.origin === delivery || (delivery === 'local' && i.region === 'RR'));
  return { generatedAt: now, sources: status, counts, offers: sortOffers(items, q.sort ?? 'recente') };
}

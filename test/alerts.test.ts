import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, isQuiet, alertText, seriesFor } from '../src/alerts.ts';
import { sortOffers } from '../src/ranking.ts';
import type { Offer, ObsRow, Rule, Settings } from '../src/types.ts';

const H = 3600_000, M = 60_000;
const T0 = Date.UTC(2026, 10, 20, 14, 0);

const offer = (o: Partial<Offer> = {}): Offer => ({
  key: 'kabum|520344|magalu|S25U|256|novo', source: 'kabum', listingId: '520344', url: 'https://www.kabum.com.br/produto/520344',
  title: 'Galaxy S25 Ultra 256GB', model: 'S25U', storageGb: 256, ramGb: 12, version: null, condition: 'novo',
  seller: 'Magalu', region: null, origin: 'nacional', originEvidence: 'Vendido e entregue por: Magalu', originUrl: null,
  originCheckedAt: T0, warranty: null, isDemo: false, firstSeen: T0, publishedAt: null, leadUrl: null, leadPostedAt: null,
  ...o,
});
const obs = (ts: number, pix: number, o: Partial<ObsRow> = {}): ObsRow => ({
  ts, pixCents: pix, cardTotalCents: Math.round(pix * 1.1), installments: 10, installmentCents: Math.round(pix * 0.11),
  listPriceCents: null, couponCode: null, couponPriceCents: null, couponReq: null, shippingCents: null,
  cashbackCents: null, available: true, promoStartTs: null, ...o,
});
const rule = (r: Partial<Rule> = {}): Rule => ({
  id: 1, model: 'S25U', storageGb: null, conditions: ['novo'], payment: 'pix', region: 'RR',
  targetCents: null, minDropCents: null, minDropPct: null, newLow: false, newOlx: false, includeShipping: false, paused: false, ...r,
});
const settings: Settings = { eligibleCoupons: [], quietStart: null, quietEnd: null, gapHours: 6, staleHours: 3, cep: '69301000' };

test('primeira observação abaixo do alvo gera alerta sem preço anterior inventado', () => {
  const ev = evaluate(rule({ targetCents: 460000 }), offer(), [obs(T0, 449900)], T0 + M, settings);
  assert.equal(ev.length, 1);
  assert.equal(ev[0].kind, 'alvo');
  assert.equal(ev[0].previousCents, null);
  assert.equal(ev[0].dropProven, false);
  const txt = alertText(ev[0], offer(), T0 + M);
  assert.doesNotMatch(txt.body, /antes/i);
});

test('queda mínima comprovada gera alerta; nova queda gera outro com chave diferente', () => {
  const r = rule({ minDropPct: 5 });
  const s1 = [obs(T0, 500000), obs(T0 + 15 * M, 450000)];
  const e1 = evaluate(r, offer(), s1, T0 + 20 * M, settings);
  assert.equal(e1.length, 1);
  assert.equal(e1[0].kind, 'queda');
  assert.equal(e1[0].previousCents, 500000);
  assert.match(alertText(e1[0], offer(), T0 + 20 * M).body, /antes R\$ 5\.000,00/);
  const s2 = [...s1, obs(T0 + 1 * H, 500000), obs(T0 + 2 * H, 440000)];
  const e2 = evaluate(r, offer(), s2, T0 + 2 * H, settings);
  assert.equal(e2.length, 1);
  assert.notEqual(e2[0].dedupeKey, e1[0].dedupeKey);
  // reavaliar sem mudança mantém a mesma chave (deduplicação estável)
  assert.equal(evaluate(r, offer(), s2, T0 + 3 * H, settings)[0].dedupeKey, e2[0].dedupeKey);
});

test('cupom exclusivo não gera alerta para quem não é elegível', () => {
  const r = rule({ targetCents: 450000 });
  const series = [obs(T0, 500000, { couponCode: 'BEMVINDO', couponPriceCents: 440000, couponReq: 'primeira_compra' })];
  assert.equal(evaluate(r, offer(), series, T0, settings).length, 0);
  assert.equal(evaluate(r, offer(), series, T0, { ...settings, eligibleCoupons: ['primeira_compra'] }).length, 1);
});

test('variantes, condição, vendedor e pagamento não se misturam', () => {
  assert.equal(evaluate(rule({ targetCents: 460000, storageGb: 512 }), offer(), [obs(T0, 449900)], T0, settings).length, 0);
  assert.equal(evaluate(rule({ targetCents: 460000 }), offer({ condition: 'usado' }), [obs(T0, 449900)], T0, settings).length, 0);
  // cartão: total parcelado 494.890 > alvo
  assert.equal(evaluate(rule({ targetCents: 460000, payment: 'cartao' }), offer(), [obs(T0, 449900)], T0, settings).length, 0);
  const pix = seriesFor([obs(T0, 449900)], 'pix', settings, false);
  const card = seriesFor([obs(T0, 449900)], 'cartao', settings, false);
  assert.notEqual(pix[0].priceCents, card[0].priceCents);
});

test('origem pendente ou internacional não alerta; modelo pausado não alerta', () => {
  const r = rule({ targetCents: 460000 });
  assert.equal(evaluate(r, offer({ origin: 'pendente' }), [obs(T0, 449900)], T0, settings).length, 0);
  assert.equal(evaluate(r, offer({ origin: 'internacional' }), [obs(T0, 449900)], T0, settings).length, 0);
  assert.equal(evaluate(rule({ targetCents: 460000, paused: true }), offer(), [obs(T0, 449900)], T0, settings).length, 0);
});

test('limite com frete: frete desconhecido não dispara; conhecido soma', () => {
  const r = rule({ targetCents: 452000, includeShipping: true });
  assert.equal(evaluate(r, offer(), [obs(T0, 449900)], T0, settings).length, 0);
  assert.equal(evaluate(r, offer(), [obs(T0, 449900, { shippingCents: 3500 })], T0, settings).length, 0);
  assert.equal(evaluate(r, offer(), [obs(T0, 449900, { shippingCents: 0 })], T0, settings).length, 1);
});

test('região RR aceita loja online nacional e anúncio local de RR, rejeita anúncio de outro estado', () => {
  const r = rule({ targetCents: 460000 });
  assert.equal(evaluate(r, offer({ region: 'RR' }), [obs(T0, 449900)], T0, settings).length, 1);
  assert.equal(evaluate(r, offer({ region: 'SP', source: 'olx' }), [obs(T0, 449900)], T0, settings).length, 0);
  assert.equal(evaluate(rule({ targetCents: 460000, region: 'BR' }), offer({ region: 'SP', source: 'olx' }), [obs(T0, 449900)], T0, settings).length, 1);
});

test('novo menor preço exige histórico anterior', () => {
  const r = rule({ newLow: true });
  assert.equal(evaluate(r, offer(), [obs(T0, 449900)], T0, settings).length, 0);
  const e = evaluate(r, offer(), [obs(T0, 460000), obs(T0 + H, 449900)], T0 + H, settings);
  assert.deepEqual(e.map(x => x.kind), ['minimo']);
});

test('horário silencioso no fuso de Boa Vista, inclusive atravessando meia-noite', () => {
  const s = { ...settings, quietStart: '22:00', quietEnd: '07:00' };
  assert.equal(isQuiet(Date.UTC(2026, 10, 21, 3, 0), s), true);   // 23:00 BV
  assert.equal(isQuiet(Date.UTC(2026, 10, 21, 12, 0), s), false); // 08:00 BV
  assert.equal(isQuiet(T0, settings), false);
});

test('frete desconhecido não vence o ranking de total entregue', () => {
  const items = [
    { key: 'a', totalCents: null, pixCents: 400000, provenDropCents: null, observedSince: 1 },
    { key: 'b', totalCents: 453400, pixCents: 449900, provenDropCents: 40000, observedSince: 2 },
    { key: 'c', totalCents: 470000, pixCents: 470000, provenDropCents: null, observedSince: 3 },
  ];
  const r = sortOffers(items, 'total');
  assert.deepEqual(r.map(x => x.key), ['b', 'c', 'a']); // "a" vai para o fim, como "frete a calcular"
  assert.deepEqual(sortOffers(items, 'queda').map(x => x.key)[0], 'b');
  assert.deepEqual(sortOffers(items, 'recente').map(x => x.key)[0], 'c');
});

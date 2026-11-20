// Casos levantados pela revisão independente (descontos falsos, mistura de variantes, duração inflada).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluate, seriesFor, alertText } from '../src/alerts.ts';
import { summarize } from '../src/history.ts';
import { parseTitle } from '../src/catalog.ts';
import { parseProduct } from '../src/sources/kabum.ts';
import { sortOffers } from '../src/ranking.ts';
import { manualFound } from '../src/manual.ts';
import type { Offer, ObsRow, Rule, Settings } from '../src/types.ts';

const H = 3600_000, T0 = Date.UTC(2026, 10, 20, 14, 0);
const S: Settings = { eligibleCoupons: [], quietStart: null, quietEnd: null, gapHours: 6, staleHours: 3, cep: '69301000' };
const obs = (ts: number, pix: number | null, o: Partial<ObsRow> = {}): ObsRow => ({ ts, pixCents: pix, cardTotalCents: pix, installments: null, installmentCents: null,
  listPriceCents: null, couponCode: null, couponPriceCents: null, couponReq: null, shippingCents: null, cashbackCents: null, available: true, promoStartTs: null, ...o });
const offer: Offer = { key: 'k', source: 'kabum', listingId: '1', url: 'u', title: 't', model: 'S25U', storageGb: 256, ramGb: 12, version: 'brasil', condition: 'novo',
  seller: 'KaBuM!', region: null, origin: 'nacional', originEvidence: null, originUrl: null, originCheckedAt: null, warranty: null, isDemo: false, firstSeen: T0,
  publishedAt: null, leadUrl: null, leadPostedAt: null };
const rule = (r: Partial<Rule> = {}): Rule => ({ id: 1, model: 'S25U', storageGb: null, conditions: ['novo'], payment: 'pix', region: 'RR', targetCents: null,
  minDropCents: null, minDropPct: null, newLow: false, newOlx: false, includeShipping: false, paused: false, ...r });

test('esgotado sem preço interrompe o período (não estende a duração)', () => {
  const rows = [obs(T0, 100000), obs(T0 + H, null, { available: false }), obs(T0 + 5 * H, 100000)];
  const s = summarize(seriesFor(rows, 'pix', S, false), T0 + 5 * H, { gapMs: 6 * H, staleMs: 3 * H });
  assert.equal(s.observedSince, T0 + 5 * H);
  const s2 = summarize(seriesFor(rows.slice(0, 2), 'pix', S, false), T0 + H, { gapMs: 6 * H, staleMs: 3 * H });
  assert.equal(s2.available, false);
});

test('queda incerta não sobe no ranking "maior queda comprovada"', () => {
  const r = sortOffers([
    { key: 'incerta', totalCents: null, pixCents: 1, provenDropCents: null, observedSince: 1 },
    { key: 'comprovada', totalCents: null, pixCents: 1, provenDropCents: 1000, observedSince: 1 },
  ], 'queda');
  assert.equal(r[0].key, 'comprovada');
});

const PRODUCT = readFileSync(new URL('./fixtures/kabum-produto-520344.html', import.meta.url), 'utf8');
test('KaBuM: sem vendedor explícito ou parceiro "Kabum Outlet" não vira origem nacional', () => {
  const noSeller = PRODUCT.replaceAll('"sellerName":"Magalu"', '"sellerName":""').replaceAll('"isMarketplace":true', '"isMarketplace":false');
  assert.equal(parseProduct(noSeller, 'u', T0)!.offer.origin, 'pendente');
  const outlet = PRODUCT.replaceAll('"sellerName":"Magalu"', '"sellerName":"Kabum Outlet"').replaceAll('"isMarketplace":true', '"isMarketplace":false');
  assert.equal(parseProduct(outlet, 'u', T0)!.offer.origin, 'pendente');
  const own = PRODUCT.replaceAll('"sellerName":"Magalu"', '"sellerName":"KaBuM!"').replaceAll('"isMarketplace":true', '"isMarketplace":false');
  assert.equal(parseProduct(own, 'u', T0)!.offer.origin, 'nacional');
});

test('alvo: nova queda dentro da faixa não re-alerta; só a entrada na faixa', () => {
  const r = rule({ targetCents: 100000 });
  const rows = [obs(T0, 90000), obs(T0 + H, 95000), obs(T0 + 2 * H, 94999)];
  assert.equal(evaluate(r, offer, rows, T0 + 2 * H, S).length, 0);
  const back = [obs(T0, 120000), obs(T0 + H, 94999)];
  assert.equal(evaluate(r, offer, back, T0 + H, S).length, 1);
});

test('títulos: acessório depois do modelo, sinal, ×, cópia, defeito, nunca usado', () => {
  assert.equal(parseTitle('Samsung Galaxy S25 Ultra 256GB Capa Silicone').excluded, 'acessorio');
  assert.equal(parseTitle('S24 Ultra 256GB com caixa e carregador').excluded, null);
  assert.equal(parseTitle('S24 Ultra + capa + película').excluded, null);
  assert.equal(parseTitle('S25 Ultra sinal R$ 500 + saldo').excluded, 'parcela_ou_entrada');
  assert.equal(parseTitle('S25 Ultra 12× 289').excluded, 'parcela_ou_entrada');
  assert.equal(parseTitle('S25 Ultra cópia AAA').excluded, 'replica');
  assert.equal(parseTitle('S24 Ultra com defeito').excluded, 'pecas');
  assert.equal(parseTitle('S24 Ultra sem defeito, sem trincas').excluded, null);
  assert.equal(parseTitle('S24 Ultra desbloqueado 256GB').excluded, null);
  assert.equal(parseTitle('S24 Ultra nunca usado lacrado').condition, 'novo');
  assert.equal(parseTitle('S24 Ultra pouco uso').condition, 'seminovo');
  assert.equal(parseTitle('S24 Ultra 256GB').conditionExplicit, false);
});

test('OLX sem condição no título nem no formulário pede a condição', () => {
  const r = manualFound({ url: 'https://rr.olx.com.br/x/1234567890', title: 'Galaxy S24 Ultra 256GB', price: '3500', location: 'Boa Vista, RR' }, T0) as any;
  assert.match(r.error, /condição/);
});

test('regra por versão: brasileira não recebe alerta de versão chinesa; texto mostra a versão', () => {
  const r = rule({ targetCents: 500000, version: 'brasil' });
  assert.equal(evaluate(r, { ...offer, version: 'china' }, [obs(T0, 400000)], T0, S).length, 0);
  const ev = evaluate(rule({ targetCents: 500000 }), { ...offer, version: 'china' }, [obs(T0, 400000)], T0, S);
  assert.match(alertText(ev[0], { ...offer, version: 'china' }, T0).title, /versão china/);
});

test('cobertura efetiva dos mínimos desconta lacunas de coleta', () => {
  const D = 24 * H;
  const s = summarize([{ ts: T0, priceCents: 1 }, { ts: T0 + 40 * D, priceCents: 2 }, { ts: T0 + 40 * D + H, priceCents: 2 }], T0 + 40 * D + H, { gapMs: 6 * H, staleMs: 3 * H });
  assert.ok(s.min90!.effectiveDays < 0.1, `efetiva ${s.min90!.effectiveDays}`);
  assert.ok(s.min90!.coverageDays > 39);
});

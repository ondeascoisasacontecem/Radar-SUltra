import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Db } from '../src/db.ts';
import { Collector } from '../src/collector.ts';
import { parseProduct, parseSearch } from '../src/sources/kabum.ts';
import type { Source } from '../src/sources/types.ts';

const PRODUCT = readFileSync(new URL('./fixtures/kabum-produto-520344.html', import.meta.url), 'utf8');
const SEARCH = readFileSync(new URL('./fixtures/kabum-busca-s25-ultra.html', import.meta.url), 'utf8');
const T0 = Date.UTC(2026, 10, 20, 14, 0);
const URL1 = 'https://www.kabum.com.br/produto/520344/x';

test('KaBuM real: Pix, cartão, parcelas, vendedor e origem pendente para marketplace', () => {
  const f = parseProduct(PRODUCT, URL1, T0)!;
  assert.equal(f.offer.model, 'S24U');
  assert.equal(f.offer.storageGb, 256);
  assert.equal(f.offer.seller, 'Magalu');
  assert.equal(f.offer.origin, 'pendente'); // parceiro de marketplace não declara envio
  assert.equal(f.obs.pixCents, 539900);
  assert.equal(f.obs.cardTotalCents, 599889);
  assert.equal(f.obs.installments, 10);
  assert.equal(f.obs.installmentCents, 59988);
  assert.equal(f.obs.shippingCents, null); // frete a calcular
  assert.equal(f.obs.listPriceCents, null); // oldPrice 0 = sem preço de referência
  assert.equal(f.obs.promoStartTs, null);
  assert.equal(f.offer.version, 'brasil'); // código Anatel na página
  assert.match(f.offer.warranty!, /Sem Garantia/);
});

test('KaBuM real: busca devolve só produtos do modelo pedido (sem S25 comum ou FE)', () => {
  const urls = parseSearch(SEARCH, 'S25U');
  for (const u of urls) assert.match(u, /s25-ultra/i);
});

function mkDb() {
  const dir = mkdtempSync(join(tmpdir(), 'radar-'));
  return { path: join(dir, 'radar.db'), done: () => rmSync(dir, { recursive: true, force: true }) };
}

function fakeSource(prices: Array<number | Error>, seller = 'KaBuM!'): Source {
  let i = 0;
  return {
    id: 'fake', label: 'fake', method: 'ativa', intervalMin: 15, ready: () => true,
    async collect(ctx) {
      const p = prices[Math.min(i++, prices.length - 1)];
      if (p instanceof Error) throw p;
      const html = PRODUCT.replace('"priceWithDiscount":5399,', `"priceWithDiscount":${p / 100},`)
        .replaceAll('"isMarketplace":true', '"isMarketplace":false').replaceAll('"sellerName":"Magalu"', `"sellerName":"${seller}"`);
      return [parseProduct(html, URL1, ctx.now())!];
    },
  };
}

test('reiniciar o serviço preserva histórico e não duplica notificações', async () => {
  const { path, done } = mkDb();
  let now = T0;
  const pushed: string[] = [];
  const push = async (a: any) => { pushed.push(a.title); };
  let db = new Db(path);
  db.saveRule({ model: 'S24U', storageGb: 256, conditions: ['novo'], payment: 'pix', region: 'RR', targetCents: 520000, minDropCents: null, minDropPct: 5, newLow: false, newOlx: false, includeShipping: false, paused: false });
  let c = new Collector(db, [fakeSource([540000, 500000])], push, () => now, fetch, 0);
  await c.tick(true);
  now += 15 * 60_000;
  await c.tick(true);
  assert.equal(pushed.length, 2); // alvo + queda
  db.close();

  // "reinício": novo processo, mesmo arquivo
  db = new Db(path);
  c = new Collector(db, [fakeSource([500000])], push, () => now + 15 * 60_000, fetch, 0);
  await c.tick(true);
  assert.equal(pushed.length, 2, 'sem notificação duplicada');
  const key = db.offers(false)[0].key;
  assert.equal(db.observations(key).length, 3, 'histórico preservado');
  assert.equal(db.alerts().length, 2);
  db.close(); done();
});

test('troca de vendedor no mesmo link não herda o preço do vendedor antigo', async () => {
  const { path, done } = mkDb();
  const db = new Db(path);
  let now = T0;
  await new Collector(db, [fakeSource([540000], 'KaBuM!')], async () => {}, () => now, fetch, 0).tick(true);
  now += 60_000;
  await new Collector(db, [fakeSource([500000], 'Loja X')], async () => {}, () => now, fetch, 0).tick(true);
  const offers = db.offers(false);
  assert.equal(offers.length, 2);
  for (const o of offers) assert.equal(db.observations(o.key).length, 1);
  db.close(); done();
});

test('falha da fonte com 429 respeita Retry-After e não grava observação', async () => {
  const { path, done } = mkDb();
  const db = new Db(path);
  let now = T0;
  const fetch429 = (async () => new Response('limite', { status: 429, headers: { 'retry-after': '7200' } })) as typeof fetch;
  const src: Source = { id: 'x', label: 'x', method: 'ativa', intervalMin: 15, ready: () => true, collect: (ctx) => ctx.fetchText('https://api.exemplo.com/q').then(() => []) };
  const c = new Collector(db, [src], async () => {}, () => now, fetch429, 0);
  const r = await c.runSource(src, true);
  assert.equal(r.ok, false);
  const st = db.sourceStatus('x');
  assert.equal(st.fail_count, 1);
  assert.equal(st.next_at, now + 7200_000);
  assert.match(st.last_error, /429/);
  // antes do horário, não tenta de novo
  now += 60 * 60_000;
  assert.deepEqual(await c.runSource(src), { ok: true, count: 0 });
  assert.equal(db.sourceStatus('x').fail_count, 1);
  db.close(); done();
});

test('fonte sem credencial fica marcada com a dependência exata', async () => {
  const { path, done } = mkDb();
  const db = new Db(path);
  const src: Source = { id: 'ml', label: 'ml', method: 'credencial', intervalMin: 60, ready: () => 'Defina ML_ACCESS_TOKEN', collect: async () => [] };
  await new Collector(db, [src], async () => {}, () => T0, fetch, 0).tick(true);
  assert.equal(db.sourceStatus('ml').last_error, 'Defina ML_ACCESS_TOKEN');
  db.close(); done();
});

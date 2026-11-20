import { test } from 'node:test';
import assert from 'node:assert/strict';
import { manualFound, parseBRL, olxSearchUrl } from '../src/manual.ts';

const T0 = Date.UTC(2026, 10, 20, 14, 0);
const base = { url: 'https://rr.olx.com.br/celulares/galaxy-s25-ultra-256gb-1234567890', title: 'Galaxy S25 Ultra 256GB seminovo', price: '4.200', location: 'Boa Vista, RR' };

test('OLX colado: registra origem manual, região RR e retirada local como evidência', () => {
  const f = manualFound(base, T0) as any;
  assert.equal(f.offer.source, 'olx');
  assert.equal(f.offer.region, 'RR');
  assert.equal(f.offer.condition, 'seminovo');
  assert.equal(f.offer.origin, 'nacional');
  assert.match(f.offer.originEvidence, /registro manual/);
  assert.equal(f.obs.pixCents, 420000);
  assert.equal(f.obs.shippingCents, null);
});

test('OLX colado: entrada/parcela no título ou valor baixo demais é recusado', () => {
  assert.match((manualFound({ ...base, title: 'Galaxy S25 Ultra entrada 600' }, T0) as any).error, /parcela ou entrada/);
  assert.match((manualFound({ ...base, price: '350' }, T0) as any).error, /parcela ou entrada/);
  assert.match((manualFound({ ...base, title: 'Capinha Galaxy S25 Ultra' }, T0) as any).error, /acessorio/);
});

test('sem localização nem evidência fica em origem pendente', () => {
  const f = manualFound({ ...base, url: 'https://loja.exemplo.com.br/p/1', location: undefined }, T0) as any;
  assert.equal(f.offer.origin, 'pendente');
});

test('preço e atalhos', () => {
  assert.equal(parseBRL('R$ 4.499,90'), 449990);
  assert.equal(parseBRL('4499.90'), 449990);
  assert.equal(parseBRL('4.499'), 449900);
  assert.match(olxSearchUrl('S25U', 'RR'), /estado-rr\?q=galaxy%20s25%20ultra/);
});

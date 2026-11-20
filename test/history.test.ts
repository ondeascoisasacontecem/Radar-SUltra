import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPeriods, summarize } from '../src/history.ts';
import { formatAge, formatBRL, formatTimeBV } from '../src/format.ts';

const H = 3600_000, M = 60_000;
const T0 = Date.UTC(2026, 10, 20, 14, 0); // 10:00 em Boa Vista (UTC-4)
const opts = { gapMs: 6 * H, staleMs: 3 * H };

test('briefing: R$ 5.000 às 10h, R$ 4.500 às 10h15, às 12h mostra "observado há 1h45"', () => {
  const obs = [
    { ts: T0, priceCents: 500000 },
    { ts: T0 + 15 * M, priceCents: 450000 },
    { ts: T0 + 2 * H, priceCents: 450000 },
  ];
  const s = summarize(obs, T0 + 2 * H, opts);
  assert.equal(s.current!.priceCents, 450000);
  assert.equal(formatAge(T0 + 2 * H - s.observedSince!), '1h45');
  assert.deepEqual(s.changeWindow, { from: T0, to: T0 + 15 * M });
  assert.equal(formatTimeBV(s.changeWindow!.from), '10:00');
  assert.equal(formatTimeBV(s.changeWindow!.to), '10:15');
  assert.equal(s.previousPriceCents, 500000);
  assert.equal(s.dropCents, 50000);
  assert.equal(s.dropProven, true);
  assert.equal(s.dropPct!.toFixed(1), '10.0');
});

test('primeira observação: sem preço anterior e sem queda comprovada', () => {
  const s = summarize([{ ts: T0, priceCents: 420000 }], T0 + 5 * M, opts);
  assert.equal(s.previousPriceCents, null);
  assert.equal(s.dropCents, null);
  assert.equal(s.dropProven, false);
  assert.equal(s.changeWindow, null);
});

test('queda, retorno ao preço antigo e segunda queda abrem três períodos novos', () => {
  const obs = [
    { ts: T0, priceCents: 500000 },
    { ts: T0 + 1 * H, priceCents: 450000 },
    { ts: T0 + 2 * H, priceCents: 500000 },
    { ts: T0 + 3 * H, priceCents: 460000 },
    { ts: T0 + 4 * H, priceCents: 460000 },
  ];
  const p = buildPeriods(obs, opts.gapMs);
  assert.deepEqual(p.map(x => x.priceCents), [500000, 450000, 500000, 460000]);
  const s = summarize(obs, T0 + 4 * H, opts);
  assert.equal(s.observedSince, T0 + 3 * H); // não herda o início da primeira queda
  assert.deepEqual(s.changeWindow, { from: T0 + 2 * H, to: T0 + 3 * H });
  assert.equal(s.previousPriceCents, 500000);
  assert.equal(s.min30!.priceCents, 450000);
});

test('falha longa de coleta deixa a continuidade incerta e não comprova queda', () => {
  const obs = [
    { ts: T0, priceCents: 500000 },
    { ts: T0 + 10 * H, priceCents: 450000 }, // 10h sem dados
  ];
  const s = summarize(obs, T0 + 10 * H, opts);
  assert.equal(s.current!.continuityUncertain, true);
  assert.equal(s.dropProven, false);
  assert.equal(s.previousPriceCents, 500000); // conhecido, mas sem continuidade
});

test('mesmo preço após lacuna não prolonga a duração', () => {
  const obs = [
    { ts: T0, priceCents: 450000 },
    { ts: T0 + 12 * H, priceCents: 450000 },
  ];
  const s = summarize(obs, T0 + 12 * H, opts);
  assert.equal(s.observedSince, T0 + 12 * H);
  assert.equal(s.current!.continuityUncertain, true);
});

test('falha da fonte (sem novas observações) não vira esgotado nem estende a promoção', () => {
  const obs = [
    { ts: T0, priceCents: 500000 },
    { ts: T0 + 15 * M, priceCents: 450000 },
  ];
  const now = T0 + 8 * H; // fonte falhando desde 10h15
  const s = summarize(obs, now, opts);
  assert.equal(s.available, true); // não inventa esgotamento
  assert.equal(s.stale, true);
  assert.equal(s.lastConfirmed, T0 + 15 * M);
  assert.equal(s.confirmedDurationMs, 0); // duração comprovada = até a última confirmação
});

test('esgotado só quando a fonte informa; volta abre novo período', () => {
  const obs = [
    { ts: T0, priceCents: 450000 },
    { ts: T0 + 1 * H, priceCents: 450000, available: false },
    { ts: T0 + 2 * H, priceCents: 450000 },
  ];
  const s = summarize(obs, T0 + 2 * H, opts);
  assert.equal(s.available, true);
  assert.equal(s.observedSince, T0 + 2 * H);
  const s2 = summarize(obs.slice(0, 2), T0 + 1 * H, opts);
  assert.equal(s2.available, false);
});

test('mínimos de 30 e 90 dias informam o período realmente coberto', () => {
  const D = 24 * H;
  const now = T0 + 40 * D;
  const obs = [
    { ts: T0, priceCents: 400000 },              // fora de 30d, dentro de 90d
    { ts: T0 + 35 * D, priceCents: 480000 },
    { ts: now, priceCents: 470000 },
  ];
  const s = summarize(obs, now, opts);
  assert.equal(s.min30!.priceCents, 470000);
  assert.equal(s.min90!.priceCents, 400000);
  assert.equal(s.min90!.coverageFrom, T0);
  assert.equal(Math.round(s.min90!.coverageDays), 40);
  assert.equal(Math.round(s.min30!.coverageDays), 30);
});

test('formatação pt-BR', () => {
  assert.equal(formatBRL(449900), 'R$ 4.499,00');
  assert.equal(formatAge(47 * M), '47 min');
  assert.equal(formatAge(26 * H), '1 dia 2h');
});

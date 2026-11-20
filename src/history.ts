// Períodos de preço de UMA série (mesma fonte, anúncio, vendedor, variante, condição e modalidade).
// Regras: só observações reais; mudança de preço abre período; lacuna > gapMs deixa continuidade incerta;
// indisponível (informado pela fonte) encerra o período; falha de coleta não gera observação.

export interface Obs { ts: number; priceCents: number; available?: boolean }

export interface Period {
  priceCents: number;
  firstSeen: number;          // início observado deste preço
  lastSeen: number;           // última confirmação
  prevObsTs: number | null;   // última observação antes da mudança
  prevPriceCents: number | null;
  continuityUncertain: boolean;
  count: number;
}

export interface MinInfo { priceCents: number; at: number; coverageFrom: number; coverageDays: number; effectiveDays: number }

export interface Summary {
  current: Period | null;
  available: boolean;
  previousPriceCents: number | null;
  dropCents: number | null;
  dropPct: number | null;
  dropProven: boolean;
  changeWindow: { from: number; to: number } | null;
  observedSince: number | null;
  lastConfirmed: number | null;
  confirmedDurationMs: number;
  stale: boolean;
  firstSeen: number | null;
  min30: MinInfo | null;
  min90: MinInfo | null;
}

export function buildPeriods(obs: Obs[], gapMs: number): Period[] {
  const sorted = [...obs].sort((a, b) => a.ts - b.ts);
  const periods: Period[] = [];
  let cur: Period | null = null;
  let lastTs: number | null = null;
  let lastAvailablePrice: number | null = null;
  for (const o of sorted) {
    const gap = lastTs !== null && o.ts - lastTs > gapMs;
    if (o.available === false) {
      cur = null; // esgotado informado: encerra o período
      lastTs = o.ts;
      continue;
    }
    if (cur && !gap && o.priceCents === cur.priceCents) {
      cur.lastSeen = o.ts;
      cur.count++;
    } else {
      cur = {
        priceCents: o.priceCents,
        firstSeen: o.ts,
        lastSeen: o.ts,
        prevObsTs: lastTs,
        prevPriceCents: lastAvailablePrice,
        continuityUncertain: gap,
        count: 1,
      };
      periods.push(cur);
    }
    lastAvailablePrice = o.priceCents;
    lastTs = o.ts;
  }
  return periods;
}

const DAY = 86_400_000;

function minWithin(obs: Obs[], now: number, days: number, gapMs: number): MinInfo | null {
  const from = now - days * DAY;
  const inWin = obs.filter(o => o.ts >= from && o.ts <= now && o.available !== false);
  if (!inWin.length) return null;
  let best = inWin[0];
  for (const o of inWin) if (o.priceCents < best.priceCents) best = o;
  const coverageFrom = Math.max(from, Math.min(...obs.map(o => o.ts)));
  // Cobertura efetiva: só intervalos entre observações consecutivas sem lacuna maior que gapMs.
  const all = obs.filter(o => o.ts >= from && o.ts <= now);
  let eff = 0;
  for (let i = 1; i < all.length; i++) { const d = all[i].ts - all[i - 1].ts; if (d <= gapMs) eff += d; }
  return { priceCents: best.priceCents, at: best.ts, coverageFrom, coverageDays: (now - coverageFrom) / DAY, effectiveDays: eff / DAY };
}

export function summarize(obs: Obs[], now: number, o: { gapMs: number; staleMs: number }): Summary {
  const sorted = [...obs].sort((a, b) => a.ts - b.ts);
  const periods = buildPeriods(sorted, o.gapMs);
  const last = sorted.at(-1);
  const available = last ? last.available !== false : false;
  const current = available ? periods.at(-1) ?? null : null;
  const prev = current?.prevPriceCents ?? null;
  const dropCents = current && prev !== null && prev > current.priceCents ? prev - current.priceCents : null;
  return {
    current,
    available,
    previousPriceCents: prev,
    dropCents,
    dropPct: dropCents !== null ? (dropCents / prev!) * 100 : null,
    dropProven: dropCents !== null && !current!.continuityUncertain,
    changeWindow: current && current.prevObsTs !== null && !current.continuityUncertain
      ? { from: current.prevObsTs, to: current.firstSeen } : null,
    observedSince: current?.firstSeen ?? null,
    lastConfirmed: last?.ts ?? null,
    confirmedDurationMs: current ? current.lastSeen - current.firstSeen : 0,
    stale: last ? now - last.ts > o.staleMs : true,
    firstSeen: sorted[0]?.ts ?? null,
    min30: minWithin(sorted, now, 30, o.gapMs),
    min90: minWithin(sorted, now, 90, o.gapMs),
  };
}

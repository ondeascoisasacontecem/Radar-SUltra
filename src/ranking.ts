export interface Rankable { key: string; totalCents: number | null; provenDropCents: number | null; observedSince: number | null }
export type Sort = 'total' | 'queda' | 'recente';

/** "total": frete desconhecido nunca vence — vai para o fim. "queda": só quedas comprovadas (sem lacuna) contam. */
export function sortOffers<T extends Rankable>(items: T[], sort: Sort): T[] {
  const nullLast = (a: number | null, b: number | null, dir: 1 | -1) =>
    a === null && b === null ? 0 : a === null ? 1 : b === null ? -1 : (a - b) * dir;
  const cmp: Record<Sort, (a: T, b: T) => number> = {
    total: (a, b) => nullLast(a.totalCents, b.totalCents, 1),
    queda: (a, b) => nullLast(a.provenDropCents, b.provenDropCents, -1),
    recente: (a, b) => nullLast(a.observedSince, b.observedSince, -1),
  };
  return [...items].sort(cmp[sort]);
}

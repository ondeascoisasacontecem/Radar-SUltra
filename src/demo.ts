// Dados de DEMONSTRAÇÃO — isolados (is_demo=1), fonte "demo", nunca geram alertas e só aparecem com ?demo=1.
import type { Db } from './db.ts';
import { offerKey } from './db.ts';

export function seedDemo(db: Db, now: number) {
  const H = 3600_000;
  const base = { source: 'demo', version: null, region: null, warranty: 'DEMONSTRAÇÃO', isDemo: true, publishedAt: null, leadUrl: null, leadPostedAt: null } as const;
  const o1 = { ...base, key: offerKey('demo', 'd1', 'Loja Demo', 'S25U', 256, 'novo'), listingId: 'd1', url: 'https://example.invalid/demo1',
    title: '[DEMO] Galaxy S25 Ultra 256GB', model: 'S25U' as const, storageGb: 256, ramGb: 12, condition: 'novo' as const, seller: 'Loja Demo',
    origin: 'nacional' as const, originEvidence: '[DEMO] Envio de SP', originUrl: 'https://example.invalid/demo1', originCheckedAt: now, firstSeen: now - 30 * H };
  db.upsertOffer(o1);
  const obs = (ts: number, pix: number, ship: number | null) => ({ ts, pixCents: pix, cardTotalCents: Math.round(pix * 1.11), installments: 10,
    installmentCents: Math.round(pix * 0.111), listPriceCents: 699900, couponCode: null, couponPriceCents: null, couponReq: null,
    shippingCents: ship, cashbackCents: 5000, available: true, promoStartTs: null });
  db.addObservation(o1.key, obs(now - 30 * H, 489900, 3500));
  db.addObservation(o1.key, obs(now - 50 * 60_000, 489900, 3500));
  db.addObservation(o1.key, obs(now - 47 * 60_000, 449900, 3500));
  db.addObservation(o1.key, obs(now - 3 * 60_000, 449900, 3500));
}

import type { Condition, ModelId } from './catalog.ts';

export type Payment = 'pix' | 'cartao';
export type Origin = 'nacional' | 'pendente' | 'internacional';

/** Uma série de preço = uma oferta: fonte + anúncio + vendedor + variante + condição. */
export interface Offer {
  key: string;
  source: string;            // kabum | mercadolivre | olx | manual | demo
  listingId: string;
  url: string;
  title: string;
  model: ModelId;
  storageGb: number | null;
  ramGb: number | null;
  version: 'global' | 'china' | 'brasil' | null;
  condition: Condition;
  seller: string | null;
  region: string | null;     // UF do anúncio local (OLX); null = loja online com entrega nacional
  origin: Origin;
  originEvidence: string | null;
  originUrl: string | null;
  originCheckedAt: number | null;
  warranty: string | null;
  isDemo: boolean;
  firstSeen: number;          // primeiro registro pelo Radar
  publishedAt: number | null; // publicação informada pela fonte
  leadUrl: string | null;     // post de comunidade (pista)
  leadPostedAt: number | null;
}

/** Observação real. Centavos, UTC (ms). null = a fonte não informou. */
export interface ObsRow {
  ts: number;
  pixCents: number | null;
  cardTotalCents: number | null;
  installments: number | null;
  installmentCents: number | null;
  listPriceCents: number | null;   // "preço de referência da loja" (riscado). Nunca vira "preço anterior".
  couponCode: string | null;
  couponPriceCents: number | null; // preço final no Pix com o cupom
  couponReq: string | null;        // requisito: primeira_compra | app | prime | ... ; null = aberto a todos
  shippingCents: number | null;    // null = frete a calcular
  cashbackCents: number | null;
  available: boolean;
  promoStartTs: number | null;     // só quando a fonte informa explicitamente
}

export interface Rule {
  id: number;
  model: ModelId;
  storageGb: number | null;
  conditions: Condition[];
  payment: Payment;
  region: 'RR' | 'BR';
  targetCents: number | null;
  minDropCents: number | null;
  minDropPct: number | null;
  newLow: boolean;
  newOlx: boolean;
  includeShipping: boolean;
  paused: boolean;
  version?: 'brasil' | 'global' | 'china' | null; // null/ausente = qualquer versão
}

export interface Settings {
  eligibleCoupons: string[];
  quietStart: string | null; // "22:00" no fuso de Boa Vista
  quietEnd: string | null;
  gapHours: number;
  staleHours: number;
  cep: string;
}

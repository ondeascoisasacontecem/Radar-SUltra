// Entrada assistida: OLX (obrigatória, sem API de busca de terceiros) e qualquer oferta/post colado à mão.
import { parseTitle, MODELS, type ModelId, type Condition } from './catalog.ts';
import { offerKey } from './db.ts';
import type { Found } from './sources/types.ts';

export function parseBRL(s: string | number | null | undefined): number | null {
  if (s === null || s === undefined || s === '') return null;
  if (typeof s === 'number') return Math.round(s * 100);
  const t = s.replace(/[^\d,.]/g, '');
  const n = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t.replace(/\.(?=\d{3}$)/, ''));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
}

export function olxSearchUrl(model: ModelId, region: 'RR' | 'BR'): string {
  const q = encodeURIComponent(MODELS[model].search);
  return region === 'RR' ? `https://www.olx.com.br/estado-rr?q=${q}` : `https://www.olx.com.br/brasil?q=${q}`;
}

export interface ManualInput {
  url: string; title: string; price: string; payment?: 'pix' | 'cartao' | 'avista';
  condition?: Condition; location?: string; seller?: string; shipping?: string;
  originEvidence?: string; leadUrl?: string; leadPostedAt?: string; publishedAt?: string; model?: ModelId; storageGb?: number;
}

export function manualFound(i: ManualInput, now: number): Found | { error: string } {
  let url: URL;
  try { url = new URL(i.url); } catch { return { error: 'Link inválido.' }; }
  const t = parseTitle(i.title);
  if (t.excluded) return { error: `Anúncio fora do escopo (${t.excluded.replace(/_/g, ' ')}).` };
  const model = i.model ?? t.model;
  if (!model) return { error: 'Não reconheci o modelo. Escolha o modelo no formulário.' };
  const price = parseBRL(i.price);
  if (!price) return { error: 'Informe o preço total do aparelho.' };
  if (price < 50000) return { error: 'Preço abaixo de R$ 500: parece parcela ou entrada, não o aparelho completo.' };
  const isOlx = /(^|\.)olx\.com\.br$/.test(url.hostname);
  if (isOlx && !i.condition && !t.conditionExplicit) return { error: 'Escolha a condição (novo, seminovo, usado ou recondicionado): o título não informa.' };
  const source = isOlx ? 'olx' : 'manual';
  const uf = i.location?.toUpperCase().match(/\b([A-Z]{2})\s*$/)?.[1] ?? null; // "Boa Vista, RR" → RR
  const condition = i.condition ?? t.condition;
  const storageGb = i.storageGb ?? t.storageGb;
  const listingId = isOlx ? (url.pathname.match(/(\d{6,})/)?.[1] ?? url.pathname) : url.hostname + url.pathname;
  const evidence = i.originEvidence?.trim()
    || (isOlx && uf ? `Anúncio OLX localizado em ${i.location} (retirada/entrega local), informado manualmente` : null);
  return {
    offer: {
      key: offerKey(source, listingId, i.seller ?? null, model, storageGb, condition, t.version), source, listingId,
      url: url.toString(), title: i.title, model, storageGb, ramGb: t.ramGb, version: t.version, condition,
      seller: i.seller || null, region: isOlx ? uf : null,
      origin: evidence ? 'nacional' : 'pendente', originEvidence: evidence ? `${evidence} · registro manual` : null,
      originUrl: url.toString(), originCheckedAt: now, warranty: null, isDemo: false, firstSeen: now,
      publishedAt: i.publishedAt ? Date.parse(i.publishedAt) : null,
      leadUrl: i.leadUrl || null, leadPostedAt: i.leadPostedAt ? Date.parse(i.leadPostedAt) : null,
    },
    obs: {
      ts: now, pixCents: i.payment === 'cartao' ? null : price, cardTotalCents: i.payment === 'cartao' ? price : null,
      installments: null, installmentCents: null, listPriceCents: null, couponCode: null, couponPriceCents: null, couponReq: null,
      shippingCents: parseBRL(i.shipping) ?? (i.shipping?.trim() === '0' ? 0 : null), cashbackCents: null, available: true, promoStartTs: null,
    },
  };
}

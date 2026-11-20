// Mercado Livre — API oficial. Em 2026-11-20 /sites/MLB/search respondeu 403 sem token:
// exige app registrado em developers.mercadolivre.com.br e token OAuth (ML_ACCESS_TOKEN, ou refresh automático).
// ⚠ Campos mapeados conforme a documentação pública; NÃO validado ponta a ponta (sem credencial nesta sessão).
import { parseTitle, MODELS } from '../catalog.ts';
import { offerKey } from '../db.ts';
import type { Found, Source, SourceCtx } from './types.ts';

let token = process.env.ML_ACCESS_TOKEN ?? '';

async function refresh(): Promise<void> {
  const { ML_CLIENT_ID: id, ML_CLIENT_SECRET: secret, ML_REFRESH_TOKEN: rt } = process.env;
  if (!id || !secret || !rt) return;
  const r = await fetch('https://api.mercadolibre.com/oauth/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', client_id: id, client_secret: secret, refresh_token: rt }),
  });
  if (r.ok) token = (await r.json()).access_token;
}

export function mapItem(it: any, now: number): Found | null {
  const t = parseTitle(it.title ?? '');
  if (!t.model || t.excluded) return null;
  const condition = it.condition === 'used' ? (t.condition === 'novo' ? 'usado' : t.condition) : t.condition;
  const tags: string[] = [...(it.tags ?? []), ...(it.shipping?.tags ?? [])];
  const intl = tags.some(x => /cbt|international/i.test(x)) || it.international_delivery_mode === 'yes';
  const full = it.shipping?.logistic_type === 'fulfillment';
  const uf = it.seller_address?.state?.id?.replace('BR-', '') ?? it.address?.state_id?.replace('BR-', '') ?? null;
  const seller = String(it.seller?.nickname ?? it.seller?.id ?? '?');
  return {
    offer: {
      key: offerKey('mercadolivre', it.id, seller, t.model, t.storageGb, condition, t.version), source: 'mercadolivre',
      listingId: it.id, url: it.permalink, title: it.title, model: t.model, storageGb: t.storageGb, ramGb: t.ramGb,
      version: t.version, condition, seller, region: null,
      origin: intl ? 'internacional' : full ? 'nacional' : 'pendente',
      originEvidence: intl ? 'API: item de compra internacional (cross-border)'
        : full ? 'API: envio Mercado Livre Full (estoque em centro de distribuição no Brasil)'
        : `API: endereço do vendedor ${uf ?? 'não informado'}; local de envio não declarado`,
      originUrl: it.permalink, originCheckedAt: now, warranty: (it.warranty as string) ?? null,
      isDemo: false, firstSeen: now, publishedAt: it.date_created ? Date.parse(it.date_created) : null, leadUrl: null, leadPostedAt: null,
    },
    obs: {
      ts: now, pixCents: null, cardTotalCents: Math.round(it.price * 100), installments: it.installments?.quantity ?? null,
      installmentCents: it.installments?.amount ? Math.round(it.installments.amount * 100) : null,
      listPriceCents: it.original_price ? Math.round(it.original_price * 100) : null,
      couponCode: null, couponPriceCents: null, couponReq: null,
      shippingCents: it.shipping?.free_shipping ? 0 : null, cashbackCents: null, available: (it.available_quantity ?? 1) > 0, promoStartTs: null,
    },
  };
}

export const mercadolivre: Source = {
  id: 'mercadolivre', label: 'Mercado Livre (API oficial)', method: 'credencial',
  intervalMin: Number(process.env.ML_INTERVAL_MIN ?? 60),
  ready: () => (token || process.env.ML_REFRESH_TOKEN ? true : 'Defina ML_ACCESS_TOKEN ou ML_CLIENT_ID + ML_CLIENT_SECRET + ML_REFRESH_TOKEN'),
  async collect(ctx: SourceCtx) {
    if (!token) await refresh();
    const out: Found[] = [];
    for (const m of ctx.models) {
      const url = `https://api.mercadolibre.com/sites/MLB/search?q=${encodeURIComponent(MODELS[m].search)}&category=MLB1055&limit=50`;
      const body = JSON.parse(await ctx.fetchText(url, { fresh: true, headers: { authorization: `Bearer ${token}` } }));
      for (const it of body.results ?? []) { const f = mapItem(it, ctx.now()); if (f && f.offer.model === m) out.push(f); }
    }
    return out;
  },
};

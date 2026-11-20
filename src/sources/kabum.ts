// KaBuM: páginas públicas de busca e produto (robots.txt permite /busca e /produto).
// Lê apenas dados que a própria página entrega (JSON-LD e __NEXT_DATA__). Sem login, sem JS, sem contorno.
import { parseTitle, MODELS, type ModelId } from '../catalog.ts';
import { offerKey } from '../db.ts';
import { extractOffers } from './jsonld.ts';
import type { Found, Source, SourceCtx } from './types.ts';

const BASE = 'https://www.kabum.com.br';
const cents = (v: unknown) => (typeof v === 'number' && v > 0 ? Math.round(v * 100) : null);

export function searchUrl(model: ModelId) { return `${BASE}/busca/${MODELS[model].search.replace(/ /g, '-')}`; }

/** URLs de produto do modelo pedido, a partir da busca. */
export function parseSearch(html: string, model: ModelId): string[] {
  return [...new Set(extractOffers(html)
    .filter(o => o.url && o.name && parseTitle(o.name).model === model && !parseTitle(o.name).excluded)
    .map(o => o.url!))];
}

export function parseProduct(html: string, url: string, now: number): Found | null {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return null;
  const p = JSON.parse(m[1])?.props?.pageProps?.product;
  if (!p?.title || !p.prices) return null;
  const t = parseTitle(p.title);
  if (!t.model || t.excluded) return null;
  const declared: string = (p.marketplace?.sellerName || p.sellerName || '').trim();
  const seller = declared || 'vendedor não informado';
  const isMarketplace = !!(p.flags?.isMarketplace || p.flags?.isMarketPlaceProduct);
  const condition = p.flags?.isOpenbox ? 'seminovo' : t.condition;
  const pix = cents(p.prices.priceWithDiscount);
  const primePix = cents(p.prime?.priceWithDiscount);
  // Estoque próprio só quando a página declara explicitamente o vendedor "KaBuM!" e flags informam que não é marketplace.
  const own = p.flags && !isMarketplace && /^kabum!?$/i.test(declared);
  const tech = p.technicalInformation ?? {};
  // Código Anatel publicado = aparelho homologado no Brasil (distingue de versão global/chinesa importada).
  const version = t.version ?? (/\d{6,}/.test(String(tech.anatelCode ?? '')) ? 'brasil' : null);
  return {
    offer: {
      key: offerKey('kabum', String(p.id), seller, t.model, t.storageGb, condition, version),
      source: 'kabum', listingId: String(p.id), url, title: p.title, model: t.model, storageGb: t.storageGb, ramGb: t.ramGb,
      version, condition, seller, region: null,
      origin: own ? 'nacional' : 'pendente',
      originEvidence: own
        ? 'Página do produto: "Vendido e entregue por: KaBuM!" (estoque próprio da loja, sem marketplace)'
        : `Página do produto: "Vendido e entregue por: ${seller}" (parceiro de marketplace; local de envio não declarado)`,
      originUrl: url, originCheckedAt: now,
      warranty: typeof tech.warranty === 'string' && tech.warranty ? `${tech.warranty} (informado na página)` : null,
      isDemo: false, firstSeen: now, publishedAt: null, leadUrl: null, leadPostedAt: null,
    },
    obs: {
      ts: now, pixCents: pix, cardTotalCents: cents(p.prices.price),
      installments: p.installment?.installment ?? null, installmentCents: cents(p.installment?.amount),
      listPriceCents: cents(p.prices.oldPrice), // preço riscado = referência da loja
      couponCode: primePix && pix && primePix < pix ? 'KaBuM Prime' : null,
      couponPriceCents: primePix && pix && primePix < pix ? primePix : null,
      couponReq: primePix && pix && primePix < pix ? 'prime' : null,
      shippingCents: p.flags?.isFreeShipping ? 0 : null, // cálculo por CEP exige endpoint não documentado: "frete a calcular"
      cashbackCents: null,
      available: p.available !== false && p.flags?.isAvailable !== false,
      promoStartTs: p.offer && p.offerStartTime > 0 ? p.offerStartTime * 1000 : null,
    },
  };
}

export const kabum: Source = {
  id: 'kabum', label: 'KaBuM (páginas públicas)', method: 'ativa',
  intervalMin: Number(process.env.KABUM_INTERVAL_MIN ?? 60),
  ready: () => true,
  async collect(ctx: SourceCtx) {
    const out: Found[] = [];
    for (const model of ctx.models) {
      const urls = parseSearch(await ctx.fetchText(searchUrl(model)), model).slice(0, Number(process.env.KABUM_MAX_PRODUCTS ?? 8));
      for (const url of urls) {
        const f = parseProduct(await ctx.fetchText(url, { fresh: true }), url, ctx.now());
        if (f) out.push(f);
      }
    }
    return out;
  },
};

// Extrai dados schema.org (JSON-LD) publicados pela própria loja para buscadores.
// Não executa JS, não contorna bloqueio: se a página não entrega JSON-LD, a fonte fica "sem dados".

export interface LdOffer {
  name: string | null;
  url: string | null;
  priceCents: number | null;
  currency: string | null;
  availability: 'in_stock' | 'out_of_stock' | 'unknown';
  seller: string | null;
  sku: string | null;
}

function toCents(v: unknown): number | null {
  if (v === undefined || v === null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[^\d.,]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
}

function flatten(node: any, out: any[] = []): any[] {
  if (Array.isArray(node)) { node.forEach(n => flatten(n, out)); return out; }
  if (node && typeof node === 'object') {
    out.push(node);
    for (const k of ['@graph', 'itemListElement', 'item', 'mainEntity']) if (node[k]) flatten(node[k], out);
  }
  return out;
}

const isType = (n: any, t: string) => [].concat(n?.['@type'] ?? []).some((x: string) => x === t);

export function extractJsonLdBlocks(html: string): any[] {
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const nodes: any[] = [];
  for (const m of html.matchAll(re)) {
    try { flatten(JSON.parse(m[1].trim()), nodes); } catch { /* bloco inválido: ignora */ }
  }
  return nodes;
}

export function extractOffers(html: string): LdOffer[] {
  const out: LdOffer[] = [];
  for (const p of extractJsonLdBlocks(html).filter(n => isType(n, 'Product'))) {
    const offers = [].concat(p.offers ?? []).flatMap((o: any) => isType(o, 'AggregateOffer') ? [].concat(o.offers ?? o) : [o]);
    for (const o of offers as any[]) {
      const avail = String(o.availability ?? '');
      out.push({
        name: p.name ?? null,
        url: o.url ?? p.url ?? null,
        priceCents: toCents(o.price ?? o.lowPrice),
        currency: o.priceCurrency ?? null,
        availability: /InStock|LimitedAvailability|OnlineOnly/i.test(avail) ? 'in_stock'
          : /OutOfStock|SoldOut|Discontinued/i.test(avail) ? 'out_of_stock' : 'unknown',
        seller: (typeof o.seller === 'object' ? o.seller?.name : o.seller) ?? null,
        sku: p.sku ?? null,
      });
    }
  }
  return out;
}

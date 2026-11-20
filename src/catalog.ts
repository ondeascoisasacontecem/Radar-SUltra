// Aparelhos monitorados e reconhecimento de títulos. Regras simples e explícitas, sem IA.

export type ModelId = 'S24U' | 'S25U' | 'S26U' | 'X15U' | 'X17U';
export type Condition = 'novo' | 'seminovo' | 'usado' | 'recondicionado';

export const MODELS: Record<ModelId, { name: string; search: string; reference?: ModelId }> = {
  S24U: { name: 'Galaxy S24 Ultra', search: 'galaxy s24 ultra' },
  S25U: { name: 'Galaxy S25 Ultra', search: 'galaxy s25 ultra' },
  S26U: { name: 'Galaxy S26 Ultra', search: 'galaxy s26 ultra' },
  X15U: { name: 'Xiaomi 15 Ultra', search: 'xiaomi 15 ultra', reference: 'S25U' },
  X17U: { name: 'Xiaomi 17 Ultra', search: 'xiaomi 17 ultra', reference: 'S26U' },
};

export interface Parsed {
  model: ModelId | null;
  storageGb: number | null;
  ramGb: number | null;
  version: 'global' | 'china' | 'brasil' | null;
  condition: Condition;
  conditionExplicit: boolean;
  excluded: null | 'acessorio' | 'replica' | 'pecas' | 'so_troca' | 'parcela_ou_entrada';
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function model(t: string): ModelId | null {
  if (/\b(redmi|poco)\b/.test(t)) return null;
  const g = t.match(/\bs\s?(24|25|26)\s*ultra\b/);
  if (g) return (`S${g[1]}U`) as ModelId;
  const x = t.match(/\bxiaomi\s*(15|17)\s*ultra\b/) ?? t.match(/\bmi\s*(15|17)\s*ultra\b/);
  if (x) return (`X${x[1]}U`) as ModelId;
  return null;
}

export function parseTitle(title: string): Parsed {
  const t = norm(title);
  const tb = t.match(/\b(1|2)\s?tb\b/);
  const gbs = [...t.matchAll(/\b(\d{2,4})\s?gb\b/g)].map(m => Number(m[1]));
  const ramM = t.match(/\b(8|12|16|24)\s?gb\s*(de\s*)?ram\b/) ?? t.match(/\bram\s*(de\s*)?(8|12|16|24)\s?gb\b/);
  const ramGb = ramM ? Number(ramM[0].match(/\d+/)![0]) : (gbs.find(g => g <= 24) ?? null);
  const storageGb = tb ? Number(tb[1]) * 1024 : (gbs.find(g => g >= 128) ?? null);

  let excluded: Parsed['excluded'] = null;
  // Acessório: palavra de acessório que NÃO venha como item incluso ("com ...", "+ ...", "e ...", "acompanha ...").
  // "Capinha Galaxy S25 Ultra" e "Galaxy S25 Ultra 256GB Capa Silicone" = acessório; "S24 Ultra com caixa e carregador" = aparelho.
  const accRe = /\b(capa|capinha|case|pelicula|carregador|cabo|suporte|caneta|lente protetora|skin|kit)\b/g;
  const isAccessory = [...t.matchAll(accRe)].some(m =>
    !/(\bcom|\bacompanha|\bmais|\bbrinde|\be|\+|,)\s*$/.test(t.slice(0, m.index)));
  if (isAccessory) excluded = 'acessorio';
  else if (/\b(replica|clone|similar|copia|linha premium|1a linha|primeira linha|paralelo ai)\b/.test(t)) excluded = 'replica';
  else if (/\b(pecas|retirada de pecas|placa|sucata|nao liga|tela quebrada|para conserto|bloqueado)\b/.test(t) || /(?<!sem )\b(defeito|trincad)/.test(t)) excluded = 'pecas';
  else if (/\b(somente|so|apenas)\s+(troca|trocas)\b/.test(t)) excluded = 'so_troca';
  else if (/\b(entrada|sinal|parcela|parcelas|parcelado|mensais|por mes|\/mes|ao mes)\b/.test(t) || /\b\d{1,2}\s?[x×]\s?(de\s)?(r\$\s?)?\d/.test(t)) excluded = 'parcela_ou_entrada';

  const cond: Condition | null = /\brecondicionad|\brefurbished|\brecertificad/.test(t) ? 'recondicionado'
    : /\b(nunca usad[oa]|lacrad[oa]|novo|nova)\b/.test(t) ? 'novo'
    : /\bsemi\s?-?novo|\bvitrine\b|\bopen\s?box\b|\bpouco uso\b|\bimpecavel\b/.test(t) ? 'seminovo'
    : /\busad[oa]\b/.test(t) ? 'usado' : null;
  // Lojas vendem novo por padrão; anúncios (OLX) sem palavra de condição exigem escolha explícita (conditionExplicit=false).
  const condition: Condition = cond ?? 'novo';

  const version = /\b(chin[ae]s[ae]?|versao china|cn rom|china)\b/.test(t) ? 'china'
    : /\bglobal\b/.test(t) ? 'global' : /\b(nacional|versao brasileira|anatel)\b/.test(t) ? 'brasil' : null;

  return { model: model(t), storageGb, ramGb, version, condition, conditionExplicit: cond !== null, excluded };
}

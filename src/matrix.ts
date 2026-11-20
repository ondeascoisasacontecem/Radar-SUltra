// Matriz de fontes verificada em 2026-11-20. Link de pesquisa = atalho, nunca integração ativa.
export type Klass = 'ativa' | 'assistida' | 'credencial' | 'indisponivel';
export interface SourceInfo { id: string; name: string; klass: Klass; method: string; needs: string; data: string; interval: string; shortcut?: string; checked: string }

const D = '2026-11-20';
const q = (base: string) => base; // atalhos montados na UI por modelo

export const SOURCES_MATRIX: SourceInfo[] = [
  { id: 'kabum', name: 'KaBuM', klass: 'ativa', method: 'Páginas públicas de busca/produto com dados estruturados (JSON-LD + dados da página); robots.txt permite /busca e /produto', needs: 'nenhuma', data: 'Pix, total no cartão, parcelas, vendedor, marketplace, disponibilidade, preço Prime, frete grátis (sim/não), início de oferta quando declarado', interval: 'KABUM_INTERVAL_MIN (padrão 60 min), 2 s entre páginas', checked: D },
  { id: 'mercadolivre', name: 'Mercado Livre', klass: 'credencial', method: 'API oficial REST (/sites/MLB/search). Sem token responde 403 (testado)', needs: 'App em developers.mercadolivre.com.br + OAuth: ML_ACCESS_TOKEN ou ML_CLIENT_ID/ML_CLIENT_SECRET/ML_REFRESH_TOKEN', data: 'Preço, parcelas, vendedor, frete grátis, Full, cross-border (mapeamento não validado sem credencial)', interval: 'ML_INTERVAL_MIN (padrão 60 min)', shortcut: q('https://lista.mercadolivre.com.br/'), checked: D },
  { id: 'amazon', name: 'Amazon Brasil', klass: 'credencial', method: 'Creators API (sucessora da PA-API 5) — exige conta de Associados com vendas qualificadas', needs: 'Conta de Associados aprovada + chaves da Creators API (não implementado)', data: 'Preço, vendedor, Prime', interval: '—', shortcut: q('https://www.amazon.com.br/s?k='), checked: D },
  { id: 'olx', name: 'OLX Brasil', klass: 'assistida', method: 'API oficial só gerencia os PRÓPRIOS anúncios (sem busca de terceiros). Caminho assistido: busca por modelo/região + busca salva no app oficial + colar anúncio', needs: 'nenhuma (manual)', data: 'O que você informar: preço, condição, localização, vendedor', interval: 'manual; a notificação de anúncio novo vem do app da OLX', checked: D },
  { id: 'pelando', name: 'Pelando', klass: 'assistida', method: 'Sem RSS/API pública (/rss e /feed = 404). Post vira pista: cole o link no formulário', needs: 'nenhuma', data: 'Pista (link do post e horário do post)', interval: 'manual', shortcut: q('https://www.pelando.com.br/busca/'), checked: D },
  { id: 'promobit', name: 'Promobit', klass: 'assistida', method: 'Sem RSS público (404)', needs: 'nenhuma', data: 'Pista', interval: 'manual', shortcut: q('https://www.promobit.com.br/'), checked: D },
  { id: 'gatry', name: 'Gatry', klass: 'assistida', method: 'Sem RSS; API não documentada', needs: 'nenhuma', data: 'Pista', interval: 'manual', shortcut: q('https://gatry.com/'), checked: D },
  { id: 'hardmob', name: 'Hardmob Promoções', klass: 'indisponivel', method: 'external.php devolve HTML; robots bloqueia bots de IA', needs: '—', data: '—', interval: '—', checked: D },
  { id: 'buscape', name: 'Buscapé', klass: 'assistida', method: 'Sem API aberta; atalho de busca', needs: 'nenhuma', data: 'Atalho', interval: 'manual', shortcut: q('https://www.buscape.com.br/search?q='), checked: D },
  { id: 'zoom', name: 'Zoom', klass: 'assistida', method: 'Sem API aberta; atalho de busca', needs: 'nenhuma', data: 'Atalho', interval: 'manual', shortcut: q('https://www.zoom.com.br/search?q='), checked: D },
  { id: 'samsung', name: 'Samsung Loja Oficial', klass: 'assistida', method: 'Sem API pública; cole a oferta manualmente', needs: 'nenhuma', data: 'Atalho', interval: 'manual', shortcut: q('https://www.samsung.com/br/search/?searchvalue='), checked: D },
  { id: 'magalu', name: 'Magazine Luiza', klass: 'credencial', method: 'Programa de afiliados (Parceiro Magalu); sem API pública de busca verificada', needs: 'Cadastro de afiliado (não implementado)', data: 'Link afiliado', interval: '—', shortcut: q('https://www.magazineluiza.com.br/busca/'), checked: D },
  { id: 'casasbahia', name: 'Casas Bahia / Americanas', klass: 'credencial', method: 'Feeds só via redes de afiliados (Awin/Lomadee)', needs: 'Conta aprovada em rede de afiliados (não implementado)', data: 'Feed de produtos', interval: '—', checked: D },
  { id: 'aliexpress', name: 'AliExpress / Shopee internacional', klass: 'credencial', method: 'APIs de afiliados', needs: 'App key de afiliado', data: 'Sempre tratado como INTERNACIONAL (fora dos alertas)', interval: '—', checked: D },
];

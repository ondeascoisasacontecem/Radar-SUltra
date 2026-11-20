# Matriz de fontes — verificada em 2026-11-20

Classes: **ativa** (coleta automática permitida, sem credencial) · **dependente de credencial** · **assistida** (atalho/registro manual) · **indisponível**.
Um link de pesquisa é sempre **atalho**, nunca integração ativa. A mesma matriz aparece na tela Alertas → Fontes, com o último sucesso de cada uma.

| Fonte | Classe | Método verificado | Credencial | Dados que traz | Intervalo |
|---|---|---|---|---|---|
| KaBuM | **ativa** | Páginas públicas `/busca` e `/produto` com JSON-LD + dados da página; robots.txt permite | nenhuma | Pix, total no cartão, nº e valor de parcelas, vendedor, marketplace sim/não, disponibilidade, preço Prime, frete grátis sim/não, código Anatel, garantia, início de oferta quando declarado | `KABUM_INTERVAL_MIN` (60 min), 2 s entre páginas |
| Mercado Livre | dependente de credencial | API oficial; `/sites/MLB/search` e `/items` deram **403 sem token** (testado) | App + OAuth: `ML_ACCESS_TOKEN` ou `ML_CLIENT_ID`+`ML_CLIENT_SECRET`+`ML_REFRESH_TOKEN` | Preço, parcelas, vendedor, frete grátis, Full, cross-border. **Conector escrito, não validado ponta a ponta** | `ML_INTERVAL_MIN` (60 min) |
| Amazon BR | dependente de credencial | Creators API (sucessora da PA-API 5) | Associados com vendas qualificadas | Preço, vendedor, Prime | não implementado |
| Magazine Luiza | dependente de credencial | Parceiro Magalu (afiliados); sem API pública de busca verificada | cadastro de afiliado | link afiliado | não implementado |
| Casas Bahia / Americanas | dependente de credencial | feeds só via redes de afiliados (Awin/Lomadee) | conta aprovada | feed de produtos | não implementado |
| AliExpress / Shopee | dependente de credencial | APIs de afiliados | app key | sempre **internacional** (fora dos alertas) | não implementado |
| OLX Brasil | **assistida** | API oficial só para gerenciar os **próprios** anúncios — não há busca de terceiros autorizada. O site responde 403 a acesso automatizado, então o link de busca (`/estado-rr?q=…`, `/brasil?q=…`) não pôde ser conferido por script: abra no navegador | — | o que você colar: preço, condição, localização | manual |
| Pelando | assistida | sem RSS/API (`/rss`, `/feed` = 404); post vira **pista** | — | link e horário do post | manual |
| Promobit | assistida | sem RSS público | — | pista | manual |
| Gatry | assistida | sem RSS; API não documentada | — | pista | manual |
| Buscapé / Zoom | assistida | sem API aberta | — | atalho de busca | manual |
| Samsung loja oficial | assistida | sem API pública | — | atalho | manual |
| Hardmob | indisponível | `external.php` devolve HTML; robots bloqueia bots de IA | — | — | — |

**Lista de ferramentas citadas antes por você:** não encontrei nenhuma — o repositório estava vazio e não há memória de sessões anteriores. Se você tiver essa lista, cole-a e eu incorporo.

## Regras de coleta implementadas
- Cache HTTP (ETag / If-Modified-Since), robots.txt respeitado, 2 s entre requisições ao mesmo site.
- Erro ou limite: recuo exponencial (até 12 h) e `Retry-After` respeitado. Nenhuma observação é gravada na falha → o último preço fica, marcado como desatualizado.
- Lista de interesse (modelos com regra ou favorito) é coletada primeiro; modelos pausados não são coletados.
- Sem CAPTCHA, sem login, sem execução de JS, sem contorno de bloqueio.

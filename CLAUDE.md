# Radar SUltra — memória do projeto

Leia só a seção da tarefa. Atualize ao mudar uma decisão, um comportamento ou algo necessário para retomar o trabalho.

## Fluxo de trabalho (pedido do usuário)
1. Antes de alterar: ler o trecho relevante desta memória → localizar arquivos, decisões vigentes e testes.
2. Falta de contexto que mude a implementação (dependência desconhecida, memória × código divergentes): usar o Shotgun, aproveitando a pesquisa e a especificação já registradas. **Shotgun não está instalado (verificado em 2026-11-20)** — até ser instalado, pesquisar com as ferramentas locais e subagentes e avisar o usuário.
3. Roteamento de modelos: o agente recebe só objetivo + trechos da memória + arquivos necessários + critério de aceite. Haiku para tarefas mecânicas; Sonnet quando há decisão entre componentes; Opus só com bloqueio concreto e autorização do usuário.
4. Depois de verificar a entrega: atualizar esta memória só com o que servirá numa sessão futura.
5. Comunicação: resultado primeiro, blocos curtos, o que já dá para testar, uma pergunta por vez com a opção recomendada.

## Stack e execução
- Node 26, TypeScript executado direto (type stripping: **sem parameter properties nem enums**), `node:sqlite`, `node:test`, `web-push`. UI sem framework.
- `npm start` (porta 8787, HOST 127.0.0.1) · `npm test` · `npx tsc --noEmit` · `npm run demo` (banco separado `data/demo.db`).
- `data/` (banco, log, `vapid.json` com chave privada) e `.env` nunca vão para o git.
- GitHub: https://github.com/ondeascoisasacontecem/Radar-SUltra (branch `main`; autor `ondeascoisasacontecem@users.noreply.github.com`). Push só funciona pelo painel Terminal (login do Git Credential Manager).

## Mapa de arquivos
| Assunto | Arquivo | Testes |
|---|---|---|
| Períodos, "observado há", mínimos 30/90 | `src/history.ts` | `test/history.test.ts`, `test/review.test.ts` |
| Regras de alerta, cupom, horário silencioso, texto | `src/alerts.ts` | `test/alerts.test.ts`, `test/review.test.ts` |
| Modelo/variante/condição pelo título, exclusões OLX | `src/catalog.ts` | `test/catalog.test.ts`, `test/review.test.ts` |
| Ranking (total entregue, queda comprovada, recente) | `src/ranking.ts` | `test/alerts.test.ts` |
| Coleta: cache, robots, recuo, Retry-After | `src/collector.ts` | `test/collector.test.ts`, `test/e2e.test.ts` |
| Banco e chave da oferta (`offerKey`) | `src/db.ts` | `test/collector.test.ts` |
| KaBuM (fonte ativa) | `src/sources/kabum.ts` | fixtures reais em `test/fixtures/` |
| Mercado Livre (credencial, não validado) | `src/sources/mercadolivre.ts` | — |
| OLX/entrada manual | `src/manual.ts` | `test/manual.test.ts` |
| Dados para a tela | `src/view.ts` · API em `src/server.ts` | — |
| UI | `public/app.js`, `public/sw.js` | verificação manual no navegador |
| Matriz de fontes | `src/matrix.ts`, `docs/fontes.md` | — |

## Decisões vigentes
- Série de preço = fonte + anúncio + vendedor + variante (armazenamento, versão) + condição; Pix e cartão são séries separadas. Troca de vendedor = nova oferta.
- Preço anterior = último preço **observado** na mesma série. Preço riscado da loja = só "preço de referência da loja".
- Lacuna > `gapHours` (6 h) → continuidade incerta, queda não comprovada. Falha de fonte não grava observação. Esgotado só quando a fonte informa e interrompe o período.
- Alertas só para origem `nacional`. Alvo dispara ao **entrar** na faixa. Deduplicação via UNIQUE(`dedupe_key`) no banco.
- KaBuM: `nacional` só se a página declara vendedor exatamente "KaBuM!" e não é marketplace; parceiros = `pendente`. Código Anatel → versão `brasil`. Frete por CEP não disponível → "frete a calcular" (exceto frete grátis).
- OLX: sem API de busca de terceiros; caminho assistido. Sem palavra de condição no título → exige escolha.
- Xiaomi 15/17 Ultra sem venda oficial no BR (ver `docs/aparelhos.md`); substituto registrado: Xiaomi 15T Pro.

## Pendências conhecidas
- Push não testado em celular real (precisa de HTTPS; README sugere Tailscale).
- Mercado Livre depende de OAuth (`ML_ACCESS_TOKEN`...). Amazon/Magalu/Casas Bahia dependem de afiliado.
- Storage ausente em parte dos títulos da KaBuM (S26 Ultra) → "armazenamento não informado".

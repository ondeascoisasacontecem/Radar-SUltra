# Radar SUltra — Plano de implementação

> Executado com superpowers:executing-plans na mesma sessão. Especificação = briefing do usuário (2026-11-20).

**Objetivo:** PWA pessoal que mostra ofertas nacionais de celulares topo de linha, com histórico honesto e alertas.

**Arquitetura (opção mais simples que atende "coleta contínua + alerta com app fechado"):**
um único processo Node 26 (`node src/main.ts`) = servidor HTTP + agendador + SQLite embutido (`node:sqlite`) + Web Push (VAPID, serviço de push gratuito do navegador). Sem build, sem banco externo, sem fila, sem nuvem paga.
No Windows roda como Tarefa Agendada no logon; num servidor Linux, como serviço systemd. O navegador pode ficar fechado.

Alternativas descartadas: cron em nuvem / serverless (exige conta e, em geral, cartão), Postgres/Redis (desnecessário para um usuário), framework de UI (o app tem 3 telas).

**Stack:** TypeScript executado direto pelo Node 26 (type stripping), `node:sqlite`, `node:test`, `web-push`. UI: HTML + JS sem framework, Service Worker.

## Premissas explícitas
- Um usuário, um coletor. Valores em centavos, horários em UTC; exibição em pt-BR, `America/Boa_Vista`.
- Identidade de série de preço = fonte + anúncio + vendedor + variante (armazenamento/RAM/versão) + condição + modalidade (pix | cartão | à vista). Troca de vendedor ⇒ nova série.
- Lacuna de coleta maior que `GAP_HORAS` (padrão 6 h) ⇒ continuidade incerta.
- Falha de fonte não gera observação. "Esgotado" só quando a fonte diz.
- Alertas só para origem nacional comprovada.

## Tarefas
1. `src/history.ts` — períodos de preço e resumo (TDD: casos 1–3 do briefing).
2. `src/catalog.ts` — reconhecimento de modelo/variante/condição e exclusões OLX (TDD: caso 7).
3. `src/alerts.ts` — avaliação de regras, elegibilidade de cupom, horário silencioso, chave de deduplicação (TDD: casos 1, 5).
4. `src/ranking.ts` — total entregue; frete desconhecido fora do ranking (TDD: caso 6).
5. `src/db.ts` + `src/collector.ts` — persistência, cache, backoff, Retry-After, deduplicação de notificações após reinício (TDD: casos 3, 8).
6. Conectores: Mercado Livre (API oficial), feeds de comunidade (pistas), OLX assistida, demonstração isolada.
7. `src/server.ts` + `public/` — API, SSE para atualização incremental, PWA offline.
8. Documentação: fontes, aparelhos, uso. Revisão independente da lógica sensível.

## Foco de revisão
- Desconto falso: preço "de" da loja nunca vira "preço anterior".
- Mistura de variantes: 256 GB × 512 GB, novo × usado, Pix × cartão, vendedor A × B.
- Duração inflada: lacuna de coleta e falha de fonte não estendem o período.
- Parcela/entrada da OLX lida como preço total.
- Notificação repetida após reinício.

# Radar SUltra

PWA pessoal para acompanhar ofertas **nacionais** de Galaxy S24/S25/S26 Ultra e Xiaomi 15/17 Ultra.
Um único processo Node faz servidor + coleta agendada + SQLite + Web Push. O navegador pode ficar fechado.

## Iniciar (Windows)
Requisito: Node.js 24+ (testado no 26).

```powershell
npm install
```
```powershell
npm start
```
Abra http://localhost:8787. A primeira coleta começa em 1 s e leva ~30 s.

- Testes: `npm test`
- Demonstração isolada (outro banco, `data/demo.db`, marcada DEMO): `npm run demo`

## Manter rodando sem janela (Windows)
```powershell
powershell -ExecutionPolicy Bypass -File scripts\instalar-tarefa-windows.ps1
```
Inicia no logon, reinicia sozinho se cair. Log em `data\radar.log`. Remover: `Unregister-ScheduledTask -TaskName RadarSUltra -Confirm:$false`.

## Desligar o PC e manter a coleta
Copie a pasta para qualquer Linux sempre ligado que você já tenha (Raspberry Pi, VPS) e use `deploy/radar-sultra.service` (systemd). Copie `data/` junto para levar histórico e chaves de push. Nada de serviço pago é necessário.

## Acesso pelo celular (instalar a PWA + notificações)
Push e instalação exigem HTTPS. O caminho gratuito mais simples: **Tailscale** no PC e no celular.
1. Instale o Tailscale nos dois e entre na mesma conta.
2. No PC: `tailscale serve --bg 8787` → ele mostra um endereço `https://<pc>.<rede>.ts.net`.
3. No celular, abra esse endereço.
   - **Android/Chrome:** menu ⋮ → *Instalar app*. Depois, Alertas → *Ativar notificações*.
   - **iPhone (iOS 16.4+):** Compartilhar → *Adicionar à Tela de Início*; abra pelo ícone e ative as notificações em Alertas.
4. **PC:** no Chrome/Edge, ícone de instalar na barra de endereço.

## Credenciais (variáveis de ambiente)
Copie `.env.example` para `.env`. Nenhuma é obrigatória.
- Mercado Livre: `ML_ACCESS_TOKEN` (ou `ML_CLIENT_ID`, `ML_CLIENT_SECRET`, `ML_REFRESH_TOKEN`).
- Push: `VAPID_*` (geradas sozinhas em `data/vapid.json` se vazias).

## Como ler um cartão
- **Preço observado há X**: desde quando o Radar vê esse preço. "Promoção iniciada às…" só aparece quando a loja informa o horário.
- **Antes R$ …**: último preço que o Radar observou nas mesmas condições. "Preço de referência da loja" é o riscado do varejista, nunca usado como "antes".
- **⚠ incerta**: houve lacuna de coleta; a queda não é comprovada.
- **Frete a calcular**: fica fora do ranking "menor valor entregue".
- **Origem pendente**: o vendedor não declarou envio do Brasil. Não entra no feed principal nem gera alerta. Em Detalhes você pode confirmar com a evidência que viu.

## Documentos
- [docs/fontes.md](docs/fontes.md) — matriz de fontes
- [docs/aparelhos.md](docs/aparelhos.md) — comparação Xiaomi × Galaxy
- [docs/plano.md](docs/plano.md) — plano e premissas

// Radar SUltra — interface. Sem framework. Exibe em BRL, pt-BR, fuso de Boa Vista.
const TZ = 'America/Boa_Vista';
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const brl = (c) => c == null ? '—' : (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const pct = (p) => p.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
const hm = (ts) => new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(ts);
const dt = (ts) => ts ? new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(ts) : '—';
function age(ms) {
  const m = Math.max(0, Math.floor(ms / 60000)); if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60; if (h < 24) return r ? `${h}h${String(r).padStart(2, '0')}` : `${h}h`;
  const d = Math.floor(h / 24); return `${d} dia${d > 1 ? 's' : ''}${h % 24 ? ` ${h % 24}h` : ''}`;
}
const gb = (g) => g == null ? null : g >= 1024 ? `${g / 1024} TB` : `${g} GB`;
const COND = { novo: 'Novo', seminovo: 'Seminovo', usado: 'Usado', recondicionado: 'Recondicionado' };
const ORIGIN = { nacional: 'Origem nacional comprovada', pendente: 'Origem pendente', internacional: 'Internacional' };
const DEMO = new URLSearchParams(location.search).get('demo') === '1';

const state = { meta: null, data: null, offline: false, filters: JSON.parse(localStorage.getItem('radar:filters') || '{}'), open: new Set() };

async function api(path, opts) {
  const r = await fetch(path, opts && opts.body ? { method: 'POST', headers: { 'content-type': 'application/json' }, ...opts, body: JSON.stringify(opts.body) } : opts);
  const j = await r.json(); if (!r.ok) throw new Error(j.error || r.status); return j;
}

async function loadMeta() {
  try { state.meta = await api('/api/meta'); localStorage.setItem('radar:meta', JSON.stringify(state.meta)); }
  catch { state.meta = JSON.parse(localStorage.getItem('radar:meta') || 'null'); }
}

async function loadOffers() {
  const route = currentRoute();
  const f = state.filters;
  const qs = new URLSearchParams({ sort: f.sort || 'recente', ...(f.model && { model: f.model }), ...(f.condition && { condition: f.condition }),
    delivery: route === 'favoritos' ? 'todas' : (f.delivery || 'nacional'), ...(route === 'favoritos' && { favorites: '1' }), ...(DEMO && { demo: '1' }) });
  const cacheKey = `radar:offers:${qs}`;
  try {
    state.data = await api(`/api/offers?${qs}`); state.offline = false;
    localStorage.setItem(cacheKey, JSON.stringify(state.data)); localStorage.setItem('radar:lastOffers', cacheKey);
  } catch {
    state.offline = true;
    state.data = JSON.parse(localStorage.getItem(cacheKey) || localStorage.getItem(localStorage.getItem('radar:lastOffers') || '') || 'null');
  }
}

function renderStatus() {
  const el = $('#status'); const d = state.data; const now = Date.now();
  if (!d) { el.innerHTML = state.offline ? '<span class="warn">⚠️ Sem conexão e sem histórico salvo neste dispositivo.</span>' : ''; return; }
  const parts = [`Atualizado em ${dt(d.generatedAt)}`];
  let warn = '';
  if (state.offline) warn += `<span class="warn">📴 Offline — mostrando o último histórico salvo (${dt(d.generatedAt)}).</span>`;
  for (const s of d.sources || []) {
    if (s.last_error && !/Defina/.test(s.last_error)) warn += `<span class="warn">⚠️ ${esc(s.source)}: ${esc(s.last_error)} · último sucesso ${s.last_ok ? 'há ' + age(now - s.last_ok) : 'nunca'}. Preços mantidos, podem estar desatualizados.</span>`;
  }
  if (DEMO) warn += '<span class="warn">🧪 MODO DEMONSTRAÇÃO — dados fictícios, sem alertas.</span>';
  el.innerHTML = parts.join(' · ') + warn;
}

function currentRoute() { return (location.hash || '#ofertas').slice(1).split('?')[0] || 'ofertas'; }

function filtersHtml(route) {
  const f = state.filters; const models = state.meta?.models || [];
  const opt = (v, l, cur) => `<option value="${v}" ${cur === v ? 'selected' : ''}>${l}</option>`;
  return `<form class="filters" id="filters" aria-label="Filtros">
    <label>Modelo<select name="model">${opt('', 'Todos', f.model || '')}${models.map(m => opt(m.id, m.name, f.model)).join('')}</select></label>
    <label>Condição<select name="condition">${opt('', 'Todas', f.condition || '')}${Object.entries(COND).map(([k, v]) => opt(k, v, f.condition)).join('')}</select></label>
    ${route === 'ofertas' ? `<label>Entrega<select name="delivery">${opt('nacional', 'Origem nacional', f.delivery || 'nacional')}${opt('pendente', 'Origem pendente', f.delivery)}${opt('local', 'Local (RR)', f.delivery)}${opt('todas', 'Todas', f.delivery)}</select></label>` : ''}
    <label>Ordenar<select name="sort">${opt('recente', 'Mais recente', f.sort || 'recente')}${opt('total', 'Menor valor entregue', f.sort)}${opt('queda', 'Maior queda comprovada', f.sort)}</select></label>
    <button type="button" id="refresh" title="Coletar agora">↻ Coletar</button>
  </form>`;
}

function cardHtml(o) {
  const now = Date.now();
  const variant = [o.modelName, gb(o.storageGb) || 'armazenamento não informado',o.ramGb ? `${o.ramGb} GB RAM` : null, COND[o.condition], o.version ? `versão ${o.version}` : null].filter(Boolean).join(' · ');
  const pay = o.payment === 'pix' ? 'no Pix' : 'no cartão (total)';
  const drop = o.dropCents != null
    ? `<span class="${o.dropProven ? 'drop' : 'pend'}" title="${o.dropProven ? 'Queda observada pelo Radar' : 'Houve lacuna de coleta: queda não comprovada'}">↓ ${brl(o.dropCents)} (${pct(o.dropPct)})${o.dropProven ? '' : ' ⚠ incerta'}</span>` : '';
  const ship = o.shippingCents == null ? '<span class="pend">📦 Frete a calcular</span>' : o.shippingCents === 0 ? 'Frete grátis' : `Frete ${brl(o.shippingCents)}`;
  const before = o.previousCents != null && o.previousCents !== o.priceCents ? `Antes ${brl(o.previousCents)} · ` : (o.previousCents == null ? 'Primeiro registro · ' : '');
  const total = o.totalCents != null ? ` · Total ${brl(o.totalCents)}` : '';
  const origin = o.origin === 'nacional' ? `🇧🇷 ${esc(o.originEvidence?.split(' · ')[0] || ORIGIN.nacional)}` : `<span class="pend">⏳ ${ORIGIN[o.origin]}</span>`;
  const stale = o.stale ? `<span class="pend">⚠ Sem confirmação há ${age(now - o.lastConfirmed)}</span>` : `Conferido há ${age(now - o.lastConfirmed)}`;
  const avail = o.available ? '' : '<span class="pend">Esgotado (informado pela loja)</span> ';
  const coupon = o.couponCode ? `<div class="line muted">🎟️ ${esc(o.couponCode)}: ${brl(o.couponPriceCents)} ${o.couponEligible ? '(aplicado: você é elegível)' : `(exige ${esc(o.couponReq)}; não aplicado)`}</div>` : '';
  const open = state.open.has(o.key);
  return `<article class="card ${o.isDemo ? 'demo' : ''}" data-key="${esc(o.key)}">
    <h2>${esc(variant)} ${o.isDemo ? '<span class="tag">DEMO</span>' : ''}</h2>
    <div class="row"><span class="price">${avail}${brl(o.priceCents)} <small>${pay}</small></span>${drop}</div>
    <div class="line muted">${before}${ship}${total}${o.cashbackCents ? ` · Cashback ${brl(o.cashbackCents)} (à parte)` : ''}</div>
    ${coupon}
    <div class="line">${esc(o.source)}${o.seller ? ' · ' + esc(o.seller) : ''} · ${origin}</div>
    <div class="line muted">🕒 Preço observado há ${age(now - o.observedSince)}${o.continuityUncertain ? ' (continuidade incerta antes)' : ''} · ${stale}</div>
    <div class="actions">
      <a class="btn primary" href="${esc(o.url)}" target="_blank" rel="noopener">Ver oferta</a>
      <button data-fav="${esc(o.key)}" aria-pressed="${o.favorite}">${o.favorite ? '★ Favorito' : '☆ Favoritar'}</button>
      <button data-open="${esc(o.key)}" aria-expanded="${open}">${open ? 'Fechar' : 'Detalhes'}</button>
    </div>
    <div class="detail" id="d-${cssId(o.key)}" ${open ? '' : 'hidden'}></div>
  </article>`;
}
const cssId = (k) => k.replace(/[^a-z0-9]/gi, '_');

function chartSvg(obs, field) {
  const pts = obs.filter(o => o[field] != null && o.available);
  if (pts.length < 2) return '<p class="muted">Histórico insuficiente para gráfico (menos de 2 observações).</p>';
  const W = 600, H = 140, P = 28;
  const xs = pts.map(p => p.ts), ys = pts.map(p => p[field]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const X = t => P + ((t - x0) / Math.max(1, x1 - x0)) * (W - 2 * P), Y = v => H - P - ((v - y0) / Math.max(1, y1 - y0)) * (H - 2 * P);
  let d = ''; pts.forEach((p, i) => { d += i ? ` H${X(p.ts).toFixed(1)} V${Y(p[field]).toFixed(1)}` : `M${X(p.ts).toFixed(1)} ${Y(p[field]).toFixed(1)}`; });
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Histórico de preço: mínimo ${brl(y0)}, máximo ${brl(y1)}">
    <path d="${d}" fill="none" stroke="currentColor" stroke-width="2"/>
    ${pts.map(p => `<circle cx="${X(p.ts)}" cy="${Y(p[field])}" r="3" fill="currentColor"><title>${dt(p.ts)} · ${brl(p[field])}</title></circle>`).join('')}
    <text x="${P}" y="12" font-size="11" fill="currentColor">${brl(y1)}</text><text x="${P}" y="${H - 6}" font-size="11" fill="currentColor">${brl(y0)} · ${dt(x0)} → ${dt(x1)}</text>
  </svg>`;
}

async function renderDetail(key) {
  const el = document.getElementById('d-' + cssId(key)); if (!el) return;
  el.innerHTML = '<p class="muted">Carregando…</p>';
  try {
    const o = await api('/api/offer?key=' + encodeURIComponent(key));
    const field = o.payment === 'pix' ? 'pixCents' : 'cardTotalCents';
    const minTxt = (m) => m ? `${brl(m.priceCents)} em ${dt(m.at)} (período coberto: ${m.coverageDays.toFixed(1).replace('.', ',')} dias, com coleta contínua em ${m.effectiveDays.toFixed(1).replace('.', ',')} dias)` : 'sem dados';
    el.innerHTML = `${chartSvg(o.observations, field)}
      <dl>
        <dt>Preço anterior</dt><dd>${o.previousCents != null ? `${brl(o.previousCents)} — último preço observado pelo Radar, mesmas condições` : 'não há: primeira observação'}</dd>
        ${o.changeWindow ? `<dt>Mudança</dt><dd>entre ${hm(o.changeWindow.from)} e ${hm(o.changeWindow.to)} (${dt(o.changeWindow.from)} → ${dt(o.changeWindow.to)})</dd>` : ''}
        ${o.promoStartTs ? `<dt>Promoção</dt><dd>iniciada às ${dt(o.promoStartTs)} (horário informado pela loja)</dd>` : ''}
        ${o.listPriceCents ? `<dt>Ref. da loja</dt><dd>${brl(o.listPriceCents)} — preço de referência da loja (riscado), não observado pelo Radar</dd>` : ''}
        <dt>Mínimo 30 dias</dt><dd>${minTxt(o.min30)}</dd>
        <dt>Mínimo 90 dias</dt><dd>${minTxt(o.min90)}</dd>
        <dt>Pix</dt><dd>${brl(o.pixCents)}</dd>
        <dt>Cartão</dt><dd>${o.cardTotalCents != null ? `${brl(o.cardTotalCents)} total${o.installments ? ` · ${o.installments}× ${brl(o.installmentCents)}` : ''}` : 'não informado'}</dd>
        <dt>Cupom</dt><dd>${o.couponCode ? `${esc(o.couponCode)} → ${brl(o.couponPriceCents)} · requisito: ${esc(o.couponReq || 'nenhum')} · ${o.couponEligible ? 'você é elegível' : 'você não é elegível (ajuste em Alertas)'}` : 'nenhum informado'}</dd>
        <dt>Frete (CEP ${esc(o.cep)})</dt><dd>${o.shippingCents == null ? 'a calcular — fora do ranking de menor total' : brl(o.shippingCents)}</dd>
        <dt>Origem</dt><dd>${ORIGIN[o.origin]} · ${esc(o.originEvidence || 'sem evidência')} ${o.originUrl ? `· <a href="${esc(o.originUrl)}" target="_blank" rel="noopener">fonte</a>` : ''} · verificado ${dt(o.originCheckedAt)}</dd>
        <dt>Garantia</dt><dd>${esc(o.warranty || 'não informada')}</dd>
        <dt>1º registro</dt><dd>${dt(o.firstSeen)} (Radar)</dd>
        <dt>Publicação</dt><dd>${o.publishedAt ? dt(o.publishedAt) + ' (informada pela fonte)' : 'não informada pela fonte'}</dd>
        ${o.leadUrl ? `<dt>Pista</dt><dd><a href="${esc(o.leadUrl)}" target="_blank" rel="noopener">post da comunidade</a> · postado ${dt(o.leadPostedAt)} · preço verificado ${dt(o.lastConfirmed)}</dd>` : ''}
        <dt>Preço atual desde</dt><dd>${dt(o.observedSince)} (observado)</dd>
        <dt>Última confirmação</dt><dd>${dt(o.lastConfirmed)} · ${o.observations.length} observações</dd>
      </dl>
      ${o.origin !== 'nacional' ? `<form class="filters" data-origin="${esc(o.key)}"><label>Evidência de envio do Brasil<input name="evidence" placeholder='Ex.: "Enviado de Manaus/AM" na página' required></label><button>Confirmar origem nacional</button></form>` : ''}`;
  } catch (e) { el.innerHTML = `<p class="err">Não foi possível carregar os detalhes (${esc(e.message)}).</p>`; }
}

async function renderOffers(route) {
  await loadOffers(); renderStatus();
  const list = state.data?.offers || [];
  $('#main').innerHTML = filtersHtml(route) + (list.length ? list.map(cardHtml).join('') : `<p class="empty">${route === 'favoritos' ? 'Nenhum favorito ainda. Use ☆ Favoritar nas ofertas.' : `Nenhuma oferta nesta seleção.${state.data?.counts?.pendente ? ` Há ${state.data.counts.pendente} em "Origem pendente" (sem evidência de envio do Brasil).` : ''} Experimente outro filtro de Entrega ou aguarde a próxima coleta.`}</p>`);
  for (const k of state.open) renderDetail(k);
}

async function pushState() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return { supported: false };
  const reg = await navigator.serviceWorker.ready; const sub = await reg.pushManager.getSubscription();
  return { supported: true, permission: Notification.permission, sub };
}

async function renderAlerts() {
  await loadMeta();
  const [rules, alerts, ps] = await Promise.all([api('/api/rules').catch(() => []), api('/api/alerts').catch(() => []), pushState()]);
  const m = state.meta || { models: [], sources: [], status: [], settings: {}, devices: [] };
  const s = m.settings; const now = Date.now();
  const st = new Map((m.status || []).map(x => [x.source, x]));
  const modelName = (id) => m.models.find(x => x.id === id)?.name || id;
  const push = !ps.supported ? '<p class="pend">Este navegador não suporta Web Push. No iPhone: instale o app na Tela de Início (iOS 16.4+). Os alertas continuam na central abaixo.</p>'
    : !isSecureContext ? '<p class="pend">Push exige HTTPS (ou localhost). Veja o README: "Acesso pelo celular".</p>'
    : ps.sub ? `<p class="ok">✅ Notificações ativas neste dispositivo.</p><button id="push-off">Desativar neste dispositivo</button>`
    : ps.permission === 'denied' ? '<p class="err">Notificações bloqueadas nas configurações do navegador para este site.</p>'
    : '<button class="primary" id="push-on">🔔 Ativar notificações neste dispositivo</button>';
  $('#status').innerHTML = '';
  $('#main').innerHTML = `
  <fieldset><legend>Notificações</legend>${push}
    <div class="actions"><button id="test-alert">Testar alerta</button></div>
    <p class="muted">Dispositivos inscritos: ${m.devices.length ? m.devices.map(d => `${esc(d.label)} (${d.lastOk ? 'último envio ok ' + dt(d.lastOk) : d.lastError ? 'erro: ' + esc(d.lastError) : 'sem envio ainda'})`).join('; ') : 'nenhum'}</p>
  </fieldset>

  <fieldset><legend>Central de alertas</legend>
    ${alerts.length ? `<button id="read-all">Marcar todos como lidos</button>` + alerts.map(a => `<div class="card" style="margin:8px 0"><strong>${a.read ? '' : '● '}${esc(a.title)}</strong><div class="muted">${esc(a.body)}</div><div class="muted">${dt(a.created_at)} ${a.is_test ? '· teste' : ''} ${a.pushed === 1 ? '· enviado ao dispositivo' : a.pushed === 2 ? '· só na central (nenhum dispositivo inscrito)' : '· aguardando envio (horário silencioso ou falha temporária)'}</div>${a.url ? `<a href="${esc(a.url)}" target="_blank" rel="noopener">Abrir</a>` : ''}</div>`).join('') : '<p class="muted">Nenhum alerta ainda.</p>'}
  </fieldset>

  <fieldset><legend>Nova regra</legend>
    <form id="rule-form" class="grid">
      <label>Modelo<select name="model" required>${m.models.map(x => `<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select></label>
      <label>Armazenamento<select name="storageGb"><option value="">Qualquer</option><option>256</option><option>512</option><option value="1024">1 TB</option></select></label>
      <label>Versão<select name="version"><option value="">Qualquer</option><option value="brasil">Brasileira (Anatel)</option><option value="global">Global</option><option value="china">Chinesa</option></select></label>
      <label>Pagamento<select name="payment"><option value="pix">Pix / à vista</option><option value="cartao">Cartão (total parcelado)</option></select></label>
      <label>Região<select name="region"><option value="RR">Boa Vista/RR + lojas que entregam</option><option value="BR">Todo o Brasil</option></select></label>
      <label>Preço-alvo (R$)<input name="target" inputmode="decimal" placeholder="4500"></label>
      <label>Queda mínima (R$)<input name="minDrop" inputmode="decimal" placeholder="300"></label>
      <label>Queda mínima (%)<input name="minPct" inputmode="decimal" placeholder="5"></label>
      <fieldset style="grid-column:1/-1;margin:0"><legend>Condição</legend>${Object.entries(COND).map(([k, v]) => `<label class="inline"><input type="checkbox" name="cond" value="${k}" ${k === 'novo' ? 'checked' : ''}>${v}</label>`).join('')}</fieldset>
      <label class="inline"><input type="checkbox" name="newLow">Novo menor preço observado</label>
      <label class="inline"><input type="checkbox" name="includeShipping">Limite considera frete</label>
      <label class="inline"><input type="checkbox" name="newOlx">Novo anúncio OLX</label>
      <div style="grid-column:1/-1"><button class="primary">Salvar regra</button></div>
    </form>
    <p class="muted">"Novo anúncio OLX": a OLX não oferece busca de terceiros por API. O aviso de anúncio novo vem da <strong>busca salva no app da OLX</strong>; o Radar só verifica mudanças nos anúncios que você colar abaixo.</p>
  </fieldset>

  <fieldset><legend>Regras ativas</legend>
    ${rules.length ? `<div class="tablewrap"><table><tr><th>Modelo</th><th>Regra</th><th></th></tr>${rules.map(r => `<tr><td>${esc(modelName(r.model))}${r.storageGb ? ' · ' + gb(r.storageGb) : ''}${r.version ? ' · versão ' + esc(r.version) : ''}<div class="muted">${r.conditions.map(c => COND[c]).join(', ')} · ${r.payment === 'pix' ? 'Pix' : 'Cartão'} · ${r.region}</div></td>
      <td>${[r.targetCents != null && 'alvo ' + brl(r.targetCents), r.minDropCents != null && 'queda ≥ ' + brl(r.minDropCents), r.minDropPct != null && 'queda ≥ ' + r.minDropPct + '%', r.newLow && 'novo mínimo', r.includeShipping && 'com frete', r.newOlx && 'OLX (via app OLX)'].filter(Boolean).join(' · ')}${r.paused ? ' <span class="pend">pausada</span>' : ''}</td>
      <td><button data-pause="${r.id}">${r.paused ? 'Retomar' : 'Pausar'}</button> <button data-del="${r.id}" aria-label="Excluir regra">Excluir</button></td></tr>`).join('')}</table></div>` : '<p class="muted">Nenhuma regra. Crie uma acima.</p>'}
  </fieldset>

  <fieldset><legend>Preferências</legend>
    <form id="settings" class="grid">
      <label>CEP (Boa Vista/RR)<input name="cep" value="${esc(s.cep)}"></label>
      <label>Silêncio de<input type="time" name="quietStart" value="${esc(s.quietStart || '')}"></label>
      <label>até<input type="time" name="quietEnd" value="${esc(s.quietEnd || '')}"></label>
      <label>Lacuna que deixa a continuidade incerta (h)<input name="gapHours" inputmode="numeric" value="${s.gapHours}"></label>
      <fieldset style="grid-column:1/-1;margin:0"><legend>Cupons para os quais sou elegível</legend>
        ${[['primeira_compra', 'Primeira compra'], ['app', 'Compra pelo app'], ['prime', 'Assinante (Prime/Ninja)'], ['cartao_loja', 'Cartão da loja']].map(([k, l]) => `<label class="inline"><input type="checkbox" name="eligible" value="${k}" ${s.eligibleCoupons.includes(k) ? 'checked' : ''}>${l}</label>`).join('')}</fieldset>
      <fieldset style="grid-column:1/-1;margin:0"><legend>Pausar modelo (não coleta nem alerta)</legend>
        ${m.models.map(x => `<label class="inline"><input type="checkbox" name="paused" value="${x.id}" ${s.pausedModels.includes(x.id) ? 'checked' : ''}>${esc(x.name)}</label>`).join('')}</fieldset>
      <div><button class="primary">Salvar preferências</button></div>
    </form>
  </fieldset>

  <fieldset><legend>OLX — caminho assistido</legend>
    <ol>
      <li>Abra a busca: ${m.models.map(x => `<a href="${esc(x.olx.RR)}" target="_blank" rel="noopener">${esc(x.name)} (RR)</a> / <a href="${esc(x.olx.BR)}" target="_blank" rel="noopener">Brasil</a>`).join(' · ')}</li>
      <li>No app oficial da OLX, faça a mesma busca e toque em <strong>Salvar busca</strong> com notificações ligadas. <em>Esse aviso vem da OLX.</em></li>
      <li>Achou um anúncio bom? Cole abaixo. A partir daí o Radar guarda o histórico; cada novo registro seu do mesmo anúncio vira uma observação verificada.</li>
    </ol>
    <form id="manual" class="grid">
      <label style="grid-column:1/-1">Link do anúncio ou oferta<input name="url" type="url" required placeholder="https://..."></label>
      <label style="grid-column:1/-1">Título como aparece<input name="title" required placeholder="Galaxy S25 Ultra 256GB seminovo"></label>
      <label>Modelo<select name="model"><option value="">Detectar pelo título</option>${m.models.map(x => `<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select></label>
      <label>Preço total do aparelho (R$)<input name="price" required inputmode="decimal"></label>
      <label>Pagamento<select name="payment"><option value="avista">À vista / Pix</option><option value="cartao">Cartão (total)</option></select></label>
      <label>Condição<select name="condition"><option value="">Detectar</option>${Object.entries(COND).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
      <label>Localização<input name="location" placeholder="Boa Vista, RR"></label>
      <label>Vendedor<input name="seller"></label>
      <label>Frete (R$, vazio = a calcular)<input name="shipping" inputmode="decimal"></label>
      <label style="grid-column:1/-1">Evidência de origem nacional (opcional)<input name="originEvidence" placeholder='Ex.: "Envio de São Paulo/SP" ou retirada em Boa Vista'></label>
      <label>Post de comunidade (pista)<input name="leadUrl" type="url" placeholder="https://www.pelando.com.br/..."></label>
      <label>Horário do post<input name="leadPostedAt" type="datetime-local"></label>
      <div style="grid-column:1/-1"><button class="primary">Registrar</button> <span id="manual-msg" role="status"></span></div>
    </form>
  </fieldset>

  <fieldset><legend>Fontes (verificadas em ${esc(m.sources[0]?.checked || '')})</legend>
    <div class="tablewrap"><table><tr><th>Fonte</th><th>Classe</th><th>Situação</th></tr>
    ${m.sources.map(x => { const t = st.get(x.id); return `<tr><td><strong>${esc(x.name)}</strong><div class="muted">${esc(x.method)}</div>${x.klass === 'credencial' ? `<div class="muted">Precisa: ${esc(x.needs)}</div>` : ''}</td>
      <td>${{ ativa: '<span class="ok">ativa</span>', assistida: 'assistida', credencial: '<span class="pend">depende de credencial</span>', indisponivel: 'indisponível' }[x.klass]}</td>
      <td>${t ? `${t.last_ok ? 'último sucesso há ' + age(now - t.last_ok) : 'sem sucesso ainda'}${t.last_count != null ? ` · ${t.last_count} ofertas` : ''}${t.last_latency_ms != null ? ` · ${(t.last_latency_ms / 1000).toFixed(1)} s` : ''}${t.last_error ? `<div class="err">${esc(t.last_error)}</div>` : ''}` : '—'}</td></tr>`; }).join('')}
    </table></div>
  </fieldset>`;
  bindAlerts();
}

const reais = (v) => { const t = String(v || '').trim(); if (!t) return null; const n = Number(t.replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null; };

function bindAlerts() {
  $('#push-on')?.addEventListener('click', enablePush);
  $('#push-off')?.addEventListener('click', async () => { const { sub } = await pushState(); if (sub) { await api('/api/push/unsubscribe', { body: { endpoint: sub.endpoint } }); await sub.unsubscribe(); } renderAlerts(); });
  $('#test-alert').addEventListener('click', async (e) => {
    e.target.disabled = true;
    try { const r = await api('/api/alerts/test', { body: {} }); toast(r.devices ? `Teste enviado para ${r.devices} dispositivo(s).` : 'Teste registrado na central. Nenhum dispositivo com notificações ativas.'); }
    catch (err) { toast('Falha no teste: ' + err.message); }
    renderAlerts();
  });
  $('#read-all')?.addEventListener('click', async () => { await api('/api/alerts/read', { body: {} }); renderAlerts(); updateBadge(); });
  $('#rule-form').addEventListener('submit', async (e) => {
    e.preventDefault(); const f = new FormData(e.target);
    const r = { model: f.get('model'), storageGb: f.get('storageGb') ? Number(f.get('storageGb')) : null, conditions: f.getAll('cond'),
      payment: f.get('payment'), region: f.get('region'), targetCents: reais(f.get('target')), minDropCents: reais(f.get('minDrop')),
      minDropPct: f.get('minPct') ? Number(String(f.get('minPct')).replace(',', '.')) : null, newLow: f.has('newLow'), newOlx: f.has('newOlx'),
      includeShipping: f.has('includeShipping'), paused: false, version: f.get('version') || null };
    if (!r.conditions.length) return toast('Escolha ao menos uma condição.');
    if (r.targetCents == null && r.minDropCents == null && r.minDropPct == null && !r.newLow && !r.newOlx) return toast('Defina ao menos um gatilho.');
    await api('/api/rules', { body: r }); toast('Regra salva.'); renderAlerts();
  });
  document.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', async () => { if (confirm('Excluir esta regra?')) { await api('/api/rules?id=' + b.dataset.del, { method: 'DELETE' }); renderAlerts(); } }));
  document.querySelectorAll('[data-pause]').forEach(b => b.addEventListener('click', async () => {
    const rules = await api('/api/rules'); const r = rules.find(x => x.id == b.dataset.pause); r.paused = !r.paused; await api('/api/rules', { body: r }); renderAlerts();
  }));
  $('#settings').addEventListener('submit', async (e) => {
    e.preventDefault(); const f = new FormData(e.target);
    await api('/api/settings', { body: { cep: f.get('cep'), quietStart: f.get('quietStart') || null, quietEnd: f.get('quietEnd') || null,
      gapHours: Number(f.get('gapHours')) || 6, eligibleCoupons: f.getAll('eligible'), pausedModels: f.getAll('paused') } });
    toast('Preferências salvas.'); renderAlerts();
  });
  $('#manual').addEventListener('submit', async (e) => {
    e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); for (const k in f) if (f[k] === '') delete f[k];
    try { const r = await api('/api/manual', { body: f }); $('#manual-msg').textContent = r.origin === 'nacional' ? '✅ Registrado no feed.' : '✅ Registrado em "Origem pendente".'; e.target.reset(); }
    catch (err) { $('#manual-msg').textContent = '⚠️ ' + err.message; }
  });
}

function urlB64(s) { const p = '='.repeat((4 - s.length % 4) % 4); const b = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(b, c => c.charCodeAt(0)); }
async function enablePush() {
  try {
    if (await Notification.requestPermission() !== 'granted') return toast('Permissão negada.');
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64(state.meta.vapidPublic) });
    const label = /Android/i.test(navigator.userAgent) ? 'Android' : /iPhone|iPad/i.test(navigator.userAgent) ? 'iPhone/iPad' : /Windows/i.test(navigator.userAgent) ? 'PC Windows' : 'Navegador';
    await api('/api/push/subscribe', { body: { subscription: sub.toJSON(), label } }); toast('Notificações ativadas.');
  } catch (e) { toast('Não foi possível ativar: ' + e.message); }
  renderAlerts();
}

function toast(msg) { const el = $('#status'); el.innerHTML = `<span class="warn">${esc(msg)}</span>`; setTimeout(() => { if (el.textContent.includes(msg)) el.innerHTML = ''; }, 6000); }

async function updateBadge() {
  try { const a = await api('/api/alerts'); const n = a.filter(x => !x.read).length; const b = $('#badge'); b.hidden = !n; b.textContent = n; } catch {}
}

async function route() {
  const r = currentRoute();
  document.querySelectorAll('[data-route]').forEach(a => a.dataset.route === r ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'));
  if (r === 'alertas') await renderAlerts(); else await renderOffers(r);
}

document.addEventListener('change', (e) => {
  if (e.target.closest('#filters')) { const f = new FormData($('#filters')); state.filters = Object.fromEntries(f); localStorage.setItem('radar:filters', JSON.stringify(state.filters)); route(); }
});
document.addEventListener('click', async (e) => {
  const fav = e.target.closest('[data-fav]'), open = e.target.closest('[data-open]');
  if (fav) { await api('/api/favorite', { body: { key: fav.dataset.fav } }); route(); }
  if (open) { const k = open.dataset.open; state.open.has(k) ? state.open.delete(k) : state.open.add(k); route(); }
  if (e.target.id === 'refresh') { await api('/api/collect', { body: {} }).catch(() => {}); toast('Coleta iniciada. A tela atualiza sozinha ao terminar.'); }
});
document.addEventListener('submit', async (e) => {
  const f = e.target.closest('[data-origin]'); if (!f) return; e.preventDefault();
  try { await api('/api/origin', { body: { key: f.dataset.origin, evidence: new FormData(f).get('evidence') } }); route(); } catch (err) { toast(err.message); }
});
window.addEventListener('hashchange', route);

// Atualização incremental: o servidor avisa ao fim de cada coleta.
function listen() {
  if (!('EventSource' in window)) return;
  const es = new EventSource('/api/events');
  let t; es.addEventListener('update', () => { clearTimeout(t); t = setTimeout(() => { if (currentRoute() !== 'alertas') renderOffers(currentRoute()); updateBadge(); }, 500); });
}

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');
await loadMeta(); await route(); updateBadge(); listen();

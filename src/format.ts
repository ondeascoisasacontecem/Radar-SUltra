// Exibição: BRL, pt-BR, fuso de Boa Vista. Usado pelo servidor (push) e espelhado na UI.
export const TZ = 'America/Boa_Vista';

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export function formatBRL(cents: number): string {
  return brl.format(cents / 100).replace(/ /g, ' ');
}

export function formatTimeBV(ts: number): string {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(ts);
}

export function formatDateTimeBV(ts: number): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(ts).replace(',', '');
}

export function formatAge(ms: number): string {
  const min = Math.max(0, Math.floor(ms / 60_000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  if (h < 24) return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
  const d = Math.floor(h / 24), rh = h % 24;
  return `${d} dia${d > 1 ? 's' : ''}${rh ? ` ${rh}h` : ''}`;
}

export function formatPct(p: number): string {
  return p.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
}

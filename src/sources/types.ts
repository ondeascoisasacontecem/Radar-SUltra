import type { ModelId } from '../catalog.ts';
import type { Offer, ObsRow } from '../types.ts';

export interface Found { offer: Offer; obs: ObsRow }

export interface SourceCtx {
  models: ModelId[];                 // lista de interesse primeiro
  now: () => number;
  fetchText: (url: string, o?: { fresh?: boolean; headers?: Record<string, string> }) => Promise<string>;
}

export interface Source {
  id: string;
  label: string;
  method: 'ativa' | 'credencial' | 'assistida';
  intervalMin: number;
  /** true, ou o motivo pelo qual não pode rodar (ex.: variável de ambiente ausente). */
  ready: () => true | string;
  collect: (ctx: SourceCtx) => Promise<Found[]>;
}

export class HttpError extends Error {
  status: number;
  retryAfterMs: number | null;
  constructor(status: number, retryAfterMs: number | null, url: string) {
    super(`HTTP ${status} em ${new URL(url).host}`);
    this.status = status; this.retryAfterMs = retryAfterMs;
  }
}

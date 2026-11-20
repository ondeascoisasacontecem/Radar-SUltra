// Web Push (VAPID). Chaves geradas no primeiro uso e guardadas em data/vapid.json (ou via env).
import webpush from 'web-push';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import type { Db } from './db.ts';

export function setupVapid(dataDir: string): string {
  let keys = process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY
    ? { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY } : null;
  const file = `${dataDir}/vapid.json`;
  if (!keys && existsSync(file)) keys = JSON.parse(readFileSync(file, 'utf8'));
  if (!keys) { keys = webpush.generateVAPIDKeys(); writeFileSync(file, JSON.stringify(keys)); }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? 'mailto:radar-sultra@example.invalid', keys.publicKey, keys.privateKey);
  return keys.publicKey;
}

export function makePusher(db: Db, now: () => number) {
  return async (a: { id: number; title: string; body: string; url: string | null }) => {
    const subs = db.pushSubs();
    let delivered = 0, lastErr: unknown = null;
    for (const s of subs) {
      try {
        await webpush.sendNotification(JSON.parse(s.json), JSON.stringify({ ...a, tag: `alerta-${a.id}` }), { TTL: 86_400 });
        db.pushResult(s.endpoint, true, null, now()); delivered++;
      } catch (e: any) {
        lastErr = e;
        if (e?.statusCode === 404 || e?.statusCode === 410) db.deletePushSub(s.endpoint); // inscrição expirou
        else db.pushResult(s.endpoint, false, String(e?.statusCode ?? e?.message ?? e), now());
      }
    }
    if (subs.length && !delivered) throw lastErr;
    return delivered; // 0 = nenhum dispositivo inscrito: alerta fica só na central
  };
}

// Ponta a ponta: servidor real + coletor agendado sem nenhum navegador conectado + Web Push cifrado (VAPID)
// entregue a um "serviço de push" HTTPS local que imita FCM/Mozilla.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:https';
import { createECDH, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Agent } from 'node:https';
import webpush from 'web-push';
import { Db } from '../src/db.ts';
import { Collector } from '../src/collector.ts';
import { startServer } from '../src/server.ts';
import { setupVapid } from '../src/push.ts';
import { parseProduct } from '../src/sources/kabum.ts';
import type { Source } from '../src/sources/types.ts';

const PRODUCT = readFileSync(new URL('./fixtures/kabum-produto-520344.html', import.meta.url), 'utf8')
  .replaceAll('"isMarketplace":true', '"isMarketplace":false').replaceAll('"sellerName":"Magalu"', '"sellerName":"KaBuM!"');

function hasOpenssl() { try { execFileSync('openssl', ['version']); return true; } catch { return false; } }

test('coleta continua sem interface aberta e o alerta chega cifrado ao serviço de push', { skip: !hasOpenssl() && 'openssl ausente' }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'radar-e2e-'));
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(dir, 'k.pem'), '-out', join(dir, 'c.pem'), '-days', '1', '-subj', '/CN=localhost'], { stdio: 'ignore' });
  const received: Array<{ headers: any; bytes: number }> = [];
  const pushService = createServer({ key: readFileSync(join(dir, 'k.pem')), cert: readFileSync(join(dir, 'c.pem')) }, (req, res) => {
    const chunks: Buffer[] = []; req.on('data', c => chunks.push(c)).on('end', () => { received.push({ headers: req.headers, bytes: Buffer.concat(chunks).length }); res.writeHead(201).end(); });
  }).listen(0);
  await new Promise(r => pushService.once('listening', r));
  const pushPort = (pushService.address() as any).port;

  const db = new Db(join(dir, 'radar.db'));
  setupVapid(dir);
  const ecdh = createECDH('prime256v1'); ecdh.generateKeys();
  db.savePushSub({ endpoint: `https://localhost:${pushPort}/push/abc`, keys: { p256dh: ecdh.getPublicKey('base64url'), auth: randomBytes(16).toString('base64url') } }, 'teste', Date.now());
  const agent = new Agent({ rejectUnauthorized: false }); // só para o certificado autoassinado do teste
  const pusher = async (a: any) => {
    let n = 0;
    for (const s of db.pushSubs()) { await webpush.sendNotification(JSON.parse(s.json), JSON.stringify(a), { agent, TTL: 60 }); n++; }
    return n;
  };
  db.saveRule({ model: 'S24U', storageGb: null, conditions: ['novo'], payment: 'pix', region: 'RR', targetCents: 550000, minDropCents: null, minDropPct: null, newLow: false, newOlx: false, includeShipping: false, paused: false });

  let runs = 0;
  const src: Source = { id: 'fake', label: 'fake', method: 'ativa', intervalMin: 0, ready: () => true,
    collect: async (ctx) => { runs++; return [parseProduct(PRODUCT, 'https://www.kabum.com.br/produto/520344/x', ctx.now())!]; } };
  const collector = new Collector(db, [src], pusher, Date.now, fetch, 0);
  const server = startServer(db, collector, 'x', { port: 0, host: '127.0.0.1', demo: false, now: Date.now });
  const stop = collector.start(100); // nenhum cliente HTTP/SSE conectado: "interface fechada"
  await new Promise(r => setTimeout(r, 1800));
  stop(); server.close(); pushService.close();

  assert.ok(runs >= 2, `coletou ${runs} vezes sem interface`);
  const key = db.offers(false)[0].key;
  assert.ok(db.observations(key).length >= 2);
  assert.equal(db.alerts().length, 1, 'um alerta, sem duplicar a cada coleta');
  assert.equal(db.alerts()[0].pushed, 1);
  assert.equal(received.length, 1, 'um push entregue');
  assert.equal(received[0].headers['content-encoding'], 'aes128gcm'); // payload cifrado
  assert.match(received[0].headers.authorization, /^vapid t=/);
  db.close(); rmSync(dir, { recursive: true, force: true });
});

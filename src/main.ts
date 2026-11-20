// Ponto de entrada: um processo = servidor + coletor agendado. Funciona com o navegador fechado.
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Db } from './db.ts';
import { Collector } from './collector.ts';
import { kabum } from './sources/kabum.ts';
import { mercadolivre } from './sources/mercadolivre.ts';
import { setupVapid, makePusher } from './push.ts';
import { startServer } from './server.ts';
import { seedDemo } from './demo.ts';

const dataDir = process.env.RADAR_DATA ?? fileURLToPath(new URL('../data', import.meta.url));
mkdirSync(dataDir, { recursive: true });
const demo = process.argv.includes('--demo');
const db = new Db(`${dataDir}/${demo ? 'demo.db' : 'radar.db'}`); // demo usa outro arquivo: nunca mistura
if (demo) seedDemo(db, Date.now());

const vapid = setupVapid(dataDir);
const collector = new Collector(db, demo ? [] : [kabum, mercadolivre], makePusher(db, Date.now));
const port = Number(process.env.PORT ?? 8787), host = process.env.HOST ?? '127.0.0.1';
startServer(db, collector, vapid, { port, host, demo, now: Date.now });
collector.start(Number(process.env.TICK_SECONDS ?? 60) * 1000);
console.log(`Radar SUltra em http://${host === '0.0.0.0' ? 'localhost' : host}:${port}${demo ? '  [MODO DEMONSTRAÇÃO]' : ''}  · dados: ${dataDir}`);

const stop = () => { db.close(); process.exit(0); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);

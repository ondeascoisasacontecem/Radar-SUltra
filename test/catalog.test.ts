import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTitle } from '../src/catalog.ts';

test('reconhece modelo, armazenamento, RAM e condição', () => {
  const r = parseTitle('Smartphone Samsung Galaxy S24 Ultra, 5G, 256GB, 12GB RAM, Câmera 200MP');
  assert.equal(r.model, 'S24U');
  assert.equal(r.storageGb, 256);
  assert.equal(r.ramGb, 12);
  assert.equal(r.condition, 'novo');
  assert.equal(r.excluded, null);
  assert.equal(parseTitle('Galaxy S25 Ultra 1TB seminovo impecável').storageGb, 1024);
  assert.equal(parseTitle('Galaxy S25 Ultra 1TB seminovo impecável').condition, 'seminovo');
  assert.equal(parseTitle('S26 Ultra 512 gb usado').condition, 'usado');
  assert.equal(parseTitle('Galaxy S24 Ultra recondicionado 256GB').condition, 'recondicionado');
});

test('não confunde S25, S25 FE, S25 Edge ou Redmi com os Ultra', () => {
  assert.equal(parseTitle('Samsung Galaxy S25 5G 256GB').model, null);
  assert.equal(parseTitle('Galaxy S25 FE 128GB').model, null);
  assert.equal(parseTitle('Galaxy S25 Edge 512GB').model, null);
  assert.equal(parseTitle('Xiaomi Redmi Note 15 Pro').model, null);
  assert.equal(parseTitle('Xiaomi 15T Pro 512GB').model, null);
  assert.equal(parseTitle('Xiaomi 15 Ultra 16GB 512GB Global').model, 'X15U');
  assert.equal(parseTitle('Xiaomi 15 Ultra 16GB 512GB Global').version, 'global');
  assert.equal(parseTitle('Xiaomi 17 Ultra versão chinesa 512GB').version, 'china');
});

test('OLX: entrada ou parcela no título não é preço de aparelho completo', () => {
  for (const t of [
    'S25 Ultra entrada de 500 reais',
    'Galaxy S24 Ultra 12x de 400',
    'S24 Ultra parcela 350/mês',
    'Galaxy S25 Ultra 256 - R$ 300 por mês',
  ]) assert.equal(parseTitle(t).excluded, 'parcela_ou_entrada', t);
});

test('OLX: exclui acessórios, réplicas, peças e só troca', () => {
  assert.equal(parseTitle('Capinha Galaxy S25 Ultra silicone').excluded, 'acessorio');
  assert.equal(parseTitle('Película S24 Ultra').excluded, 'acessorio');
  assert.equal(parseTitle('S24 Ultra 256GB com caixa e carregador').excluded, null);
  assert.equal(parseTitle('S24 Ultra réplica linha premium').excluded, 'replica');
  assert.equal(parseTitle('S23 Ultra para retirada de peças').excluded, 'pecas');
  assert.equal(parseTitle('S25 Ultra tela quebrada para peças').excluded, 'pecas');
  assert.equal(parseTitle('S24 Ultra somente troca por iPhone').excluded, 'so_troca');
  assert.equal(parseTitle('S24 Ultra aceito troca').excluded, null); // aceitar troca não é "só troca"
});

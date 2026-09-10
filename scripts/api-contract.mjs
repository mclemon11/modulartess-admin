#!/usr/bin/env node
/**
 * Procedimiento explícito para mantener la copia versionada del contrato OpenAPI.
 *
 * Este repositorio no depende en build ni en runtime de ningún otro repositorio: el build y el
 * runtime leen **solo** `openapi/backend-v1.json`, que está comiteado. Este script es la única vía
 * para refrescar esa copia, y hay que ejecutarlo a propósito.
 *
 * Deliberadamente **no** contiene ninguna ruta a otro repositorio: el origen se pasa siempre como
 * argumento, así que no queda ninguna referencia absoluta persistente en el repositorio.
 *
 *   pnpm api:update <ruta-al-openapi.json>   Copia el contrato publicado sobre la copia local.
 *   pnpm api:generate                        Genera los tipos desde la copia local.
 *   pnpm api:check                           Falla si los tipos no coinciden con la copia local.
 */

import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import process from 'node:process';

const CONTRACT_PATH = 'openapi/backend-v1.json';
const TYPES_PATH = 'src/lib/api/generated/schema.d.ts';

function fail(message) {
  process.stderr.write(`api-contract: ${message}\n`);
  process.exit(1);
}

/** Genera los tipos a partir de la copia local y devuelve el resultado como texto. */
function generateTypes() {
  const temporary = `${TYPES_PATH}.tmp`;

  const result = spawnSync(
    process.execPath,
    ['node_modules/openapi-typescript/bin/cli.js', CONTRACT_PATH, '--output', temporary],
    { stdio: ['ignore', 'inherit', 'inherit'] },
  );

  if (result.status !== 0) {
    rmSync(temporary, { force: true });
    fail('openapi-typescript falló al generar los tipos.');
  }

  const generated = readFileSync(temporary, 'utf8');
  rmSync(temporary, { force: true });

  return generated;
}

function update() {
  const source = process.argv[3];

  if (source === undefined || source.length === 0) {
    fail(
      'falta la ruta de origen.\n' +
        '  Uso: pnpm api:update <ruta-al-openapi.json>\n' +
        '  El origen se pasa siempre como argumento: este script no fija ninguna ruta a otro repositorio.',
    );
  }

  const absolute = resolve(source);
  let parsed;

  try {
    parsed = JSON.parse(readFileSync(absolute, 'utf8'));
  } catch {
    fail(`no se pudo leer un JSON válido en ${absolute}`);
  }

  if (typeof parsed.openapi !== 'string' || typeof parsed.paths !== 'object') {
    fail('el archivo de origen no parece un documento OpenAPI (faltan "openapi" o "paths").');
  }

  copyFileSync(absolute, CONTRACT_PATH);
  process.stdout.write(`api-contract: ${CONTRACT_PATH} actualizado desde el argumento recibido.\n`);
  process.stdout.write('api-contract: ejecuta "pnpm api:generate" y revisa el diff.\n');
}

function generate() {
  mkdirSync(dirname(TYPES_PATH), { recursive: true });
  writeFileSync(TYPES_PATH, generateTypes());
  process.stdout.write(`api-contract: ${TYPES_PATH} regenerado desde ${CONTRACT_PATH}.\n`);
}

function check() {
  let committed;

  try {
    committed = readFileSync(TYPES_PATH, 'utf8');
  } catch {
    fail(`falta ${TYPES_PATH}. Ejecuta "pnpm api:generate".`);
  }

  if (committed !== generateTypes()) {
    fail(
      `${TYPES_PATH} no coincide con ${CONTRACT_PATH}.\n` +
        '  Ejecuta "pnpm api:generate" y revisa el diff.',
    );
  }

  process.stdout.write(`api-contract: ${TYPES_PATH} está sincronizado con ${CONTRACT_PATH}.\n`);
}

const command = process.argv[2];

switch (command) {
  case 'update':
    update();
    break;
  case 'generate':
    generate();
    break;
  case 'check':
    check();
    break;
  default:
    fail(`comando desconocido: ${String(command)}. Usa update, generate o check.`);
}

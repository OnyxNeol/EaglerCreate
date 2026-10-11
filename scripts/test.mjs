// scripts/test.mjs
// EaglerCreate test runner — verifies the build output and source modules.
//
// Usage: npm test
//
// MIT License. Copyright (c) The Create Team / The Creators of Create.

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

let passed = 0, failed = 0;

function assert(name, condition, detail = '') {
  if (condition) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}${detail ? ': ' + detail : ''}`);
  }
}

function main() {
  console.log('=== EaglerCreate Tests ===\n');

  // -- Build output --------------------------------------------------------
  const distBundle = join(root, 'dist', 'eagler-create.js');
  assert('dist/eagler-create.js exists', existsSync(distBundle));

  if (existsSync(distBundle)) {
    const source = readFileSync(distBundle, 'utf8');
    assert('bundle contains TickScheduler class', source.includes('class TickScheduler'));
    assert('bundle contains WebGLModelRenderer.captureTick', source.includes('captureTick(dt = 0.05)'));
    assert('bundle contains 5-step tick ordering', source.includes('Step 1: Kinetic network solve'));
    assert('bundle contains EaglerCreateAssets', source.includes('EaglerCreateAssets'));
    assert('bundle exports TickScheduler', source.includes('EaglerCreate.TickScheduler = TickScheduler'));
    assert('bundle has correct revision', source.includes('588124239141029c5321afd38d20c2eaf872b32b'));
  }

  // -- Source modules ------------------------------------------------------
  const adapterSrc = join(root, 'src', 'client', 'eagler-forge-adapter.mjs');
  assert('src/client/eagler-forge-adapter.mjs exists', existsSync(adapterSrc));
  if (existsSync(adapterSrc)) {
    const src = readFileSync(adapterSrc, 'utf8');
    assert('adapter exports TickScheduler', src.includes('export class TickScheduler'));
    assert('adapter has 5-step tick ordering', src.includes('Step 1: Kinetic network solve'));
    assert('adapter has disposal hooks', src.includes('dispose()'));
  }

  const webglSrc = join(root, 'src', 'render', 'webgl-renderer.mjs');
  assert('src/render/webgl-renderer.mjs exists', existsSync(webglSrc));
  if (existsSync(webglSrc)) {
    const src = readFileSync(webglSrc, 'utf8');
    assert('webgl renderer exports class', src.includes('export class WebGLModelRenderer'));
    assert('webgl renderer has captureTick', src.includes('captureTick(dt = 0.05)'));
    assert('webgl renderer has belt UV scroll', src.includes('scrollBelt'));
    assert('webgl renderer has animated textures', src.includes('_animatedTextures'));
  }

  // -- Manifest ------------------------------------------------------------
  const manifestPath = join(root, 'dist', 'manifest.json');
  assert('dist/manifest.json exists', existsSync(manifestPath));
  if (existsSync(manifestPath)) {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    assert('manifest has asset counts', manifest.assets?.textures === 29 && manifest.assets?.models === 41);
    assert('manifest has correct revision', manifest.assets?.revision === '588124239141029c5321afd38d20c2eaf872b32b');
  }

  // -- Disposal hooks ------------------------------------------------------
  const injectorPath = join(root, 'eagler-create-injector (2).js');
  if (existsSync(injectorPath)) {
    const src = readFileSync(injectorPath, 'utf8');
    assert('BeltTrack.dispose exists', src.includes('dispose()') && src.includes('this.disposed = true; const remaining = this.items.map'));
    assert('Depot.dispose exists', src.includes('this.holds.clear(); return this.inventory;'));
    assert('Chute.dispose exists', src.includes('this.extractor.enabled = false; return this.inventory;'));
    assert('TickScheduler.dispose exists', src.includes('TickScheduler') && src.includes('this._disposed = true'));
  }

  // -- Summary -------------------------------------------------------------
  console.log(`\n${'='.repeat(50)}`);
  console.log(`Results: ${passed}/${passed + failed} passed`);
  console.log(`${'='.repeat(50)}`);

  if (failed > 0) process.exit(1);
}

main();

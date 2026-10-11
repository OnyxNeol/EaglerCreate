// scripts/build.mjs
// EaglerCreate build script — assembles the dist bundle from the injector
// and source modules, copies EPK assets, and updates release manifests.
//
// Usage: npm run build
//
// MIT License. Copyright (c) The Create Team / The Creators of Create.

import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

// -- Configuration ----------------------------------------------------------

const INJECTOR = 'eagler-create-injector (2).js';
const DIST_DIR = join(root, 'dist');
const DIST_BUNDLE = join(DIST_DIR, 'eagler-create.js');
const DIST_MANIFEST = join(DIST_DIR, 'manifest.json');
const EPK_ZIP = join(root, 'eagler-create-assets.zip');
const DIST_EPK = join(DIST_DIR, 'eagler-create-assets.epk');

// -- Build steps ------------------------------------------------------------

function readInjector() {
  const path = join(root, INJECTOR);
  if (!existsSync(path)) throw new Error(`Injector not found: ${path}`);
  return readFileSync(path, 'utf8');
}

function readManifest() {
  if (!existsSync(DIST_MANIFEST)) {
    console.warn('[build] dist/manifest.json not found, creating new.');
    return null;
  }
  return JSON.parse(readFileSync(DIST_MANIFEST, 'utf8'));
}

function verifyAssets(source) {
  // Verify the embedded EaglerCreateAssets JSON: 29 textures, 41 models.
  const marker = 'globalThis.EaglerCreateAssets = ';
  const idx = source.indexOf(marker);
  if (idx === -1) throw new Error('EaglerCreateAssets not found in injector');
  const jsonStart = source.indexOf('{', idx);
  let depth = 0, end = jsonStart;
  for (let i = jsonStart; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') depth--;
    if (depth === 0) { end = i + 1; break; }
  }
  const assets = JSON.parse(source.slice(jsonStart, end));

  const textureCount = Object.keys(assets.textures || {}).length;
  const modelCount = Object.keys(assets.models || {}).length;
  const expectedRevision = '588124239141029c5321afd38d20c2eaf872b32b';

  console.log(`[build] Assets: ${textureCount} textures, ${modelCount} models`);
  console.log(`[build] Revision: ${assets.revision}`);

  if (textureCount !== 29) throw new Error(`Expected 29 textures, got ${textureCount}`);
  if (modelCount !== 41) throw new Error(`Expected 41 models, got ${modelCount}`);
  if (assets.revision !== expectedRevision) {
    throw new Error(`Revision mismatch: expected ${expectedRevision}, got ${assets.revision}`);
  }

  console.log('[build] Asset verification passed (29 textures, 41 models, correct revision).');
  return { textureCount, modelCount, revision: assets.revision };
}

function writeBundle(source) {
  if (!existsSync(DIST_DIR)) mkdirSync(DIST_DIR, { recursive: true });
  writeFileSync(DIST_BUNDLE, source, 'utf8');
  console.log(`[build] Wrote ${DIST_BUNDLE} (${(source.length / 1024).toFixed(1)} KB)`);
}

function copyEPK() {
  if (existsSync(EPK_ZIP)) {
    copyFileSync(EPK_ZIP, DIST_EPK);
    console.log(`[build] Copied EPK assets to ${DIST_EPK}`);
  } else {
    console.warn('[build] eagler-create-assets.zip not found, skipping EPK copy.');
  }
}

function updateManifest(assetInfo) {
  const existing = readManifest();
  const manifest = {
    name: 'EaglerCreate',
    version: '1.0.0',
    buildDate: new Date().toISOString(),
    assets: {
      textures: assetInfo.textureCount,
      models: assetInfo.modelCount,
      revision: assetInfo.revision,
    },
    modules: existing?.modules || [
      {
        id: 'eagler-create-core',
        path: 'eagler-create.js',
        description: 'Core EaglerCreate injector bundle — kinetic engine, logistics, rendering, assets.',
        global: 'EaglerCreate',
      },
      {
        id: 'eagler-forge-python',
        path: 'src/client/eagler-forge-python.mjs',
        description: 'Pyodide runtime bridge — bidirectional JS-to-Python event bridge for EaglerForge.',
        export: 'PythonBridge',
      },
      {
        id: 'eaglerforge-py',
        path: 'src/python/eaglerforge.py',
        description: 'Python modding API — createblock() and MyCustomBlock for declarative block registration.',
      },
    ],
    tests: existing?.tests || [
      {
        id: 'test-blocks',
        path: 'test/tests/test_blocks.py',
        description: 'Unit tests for Python block registration, textures, rarity, and callbacks.',
      },
    ],
    license: existing?.license || { code: 'MIT', assets: 'All Rights Reserved' },
  };
  writeFileSync(DIST_MANIFEST, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  console.log(`[build] Updated ${DIST_MANIFEST}`);
}

// -- Main -------------------------------------------------------------------

function main() {
  console.log('=== EaglerCreate Build ===\n');

  // 1. Read the injector bundle (contains all engine modules + assets).
  const source = readInjector();
  console.log(`[build] Read injector (${(source.length / 1024).toFixed(1)} KB)`);

  // 2. Verify embedded assets (29 textures, 41 models, correct revision).
  const assetInfo = verifyAssets(source);

  // 3. Write the dist bundle.
  writeBundle(source);

  // 4. Copy EPK assets.
  copyEPK();

  // 5. Update release manifest.
  updateManifest(assetInfo);

  console.log('\n[build] Build complete.');
}

main();

# EaglerCreate

EaglerCreate is a port of the Create mod for Eaglercraft (browser-based Minecraft).
This repository contains the EaglerCreate injector bundle, asset pack, and a
Python SDK (EaglerForge) for defining custom blocks via a Tkinter-style declarative API.

## Repository Structure

- `eagler-create-injector (2).js` — The main EaglerCreate mod bundle.
  Exposes `globalThis.EaglerCreate` (kinetic engine, logistics, rendering, tick
  scheduler) and `globalThis.EaglerCreateAssets` (embedded textures, models, registry).
- `eagler-create-assets.zip` — Create mod asset subset (29 textures, 41 models, OBJ files).
- `src/client/eagler-forge-adapter.mjs` — TickScheduler and EaglerForge adapter source
  (20 Hz tick ordering: engine solve → inlet funnels → belts → outlet funnels →
  chutes → depot processors → grids/crafters/particles → animation bridge capture).
- `src/render/webgl-renderer.mjs` — WebGL1 renderer source with dynamic UV scrolling
  for conveyor belts and animated PNG texture frame cycling (mcmeta).
- `src/python/eaglerforge.py` — Python modding API: `createblock()` and `MyCustomBlock`.
- `src/client/eagler-forge-python.mjs` — Pyodide runtime bridge (JS↔Python event bridge).
- `scripts/build.mjs` — Build script: verifies assets, produces `dist/eagler-create.js`,
  copies EPK files, updates release manifests. Run with `npm run build`.
- `scripts/test.mjs` — Test runner: verifies build output, source modules, and assets.
  Run with `npm test`.
- `test/index.html` — Test harness page (3D scene + Python code editor + console).
- `test/scene.js` — 3D scene setup, WebGL/Canvas renderer, animation loop.
- `test/harness.js` — Main test harness logic (Pyodide loading, UI, test runner).
- `test/tests/test_blocks.py` — Python unit tests for the modding API.

## Running the Test Harness

```bash
docker compose -f docker-compose.base44.yml up -d
```

Then open the preview at port 3000. The test harness page is at `/test/index.html`.

The root serves an EFI-injected offline client supplied locally as the ignored
`eaglercraft-injected.html`. `scripts/prepare-client.mjs` extracts its inline
scripts into ignored `.base44/client/` files before nginx starts. Do not serve
the original HTML directly: preview HTML rewriting injects bridge scripts into
HTML strings in the game's string pool, causing syntax errors. After replacing
the offline client, rerun the preparation job. Verify root startup by checking
that `main` and `ModAPI` initialize and the mod selection screen appears; the
JavaScript global alone does not prove gameplay or Python blocks work.

The preparation script also repairs the EFI launcher Done-button race: keep it
disabled until the mod list resolves, then use click rather than mousedown so
keyboard activation works. The vanilla asset loader reports 4,799 EPK resources;
a subsequent “press any key to enable sound” screen requires user interaction.
Create's 29 textures and 41 models are present in the bundle, but the injected
client reports `integration-required`: native shaft/cogwheel/water-wheel/press/
gearbox blocks and a game renderer are not registered. Do not report these
assets as visible in-game merely because the global asset map exists.

## Build & Distribution

```bash
npm run build   # Verifies assets (29 textures, 41 models), produces dist/eagler-create.js, copies EPK, updates manifest
npm test        # Verifies build output, source modules, and asset counts
```

## Architecture

### EaglerCreate Engine (JavaScript)
The injector bundle provides:
- `KineticEngine` — physics simulation (RPM, stress, capacity, networks)
- `KineticBlock` — shaft, cog, gearbox, source, consumer block types
- `TickScheduler` — 20 Hz tick ordering: engine solve → inlet funnels → belts
  (with station processors) → outlet funnels → chutes → depot processors + hold
  sync → grids/crafter animation capture → pooled particle emitters → animation
  bridge capture. All inventory mutations are atomic via commitCraft/transferItems.
- `BeltTrack`, `Depot`, `Funnel`, `Chute` — item logistics (all with dispose() hooks)
- `RecipeEngine`, `ProcessingMachine`, `MechanicalCrafterGrid` — crafting
- `ModelBuilder` — compiles Minecraft model JSON to triangle meshes
- `WebGLModelRenderer` / `CanvasModelRenderer` — 3D rendering (WebGL preferred,
  Canvas 2D fallback). WebGL renderer supports belt UV scrolling and animated
  PNG texture frame cycling via captureTick().
- `AnimationBridge` — animates block models (rotation, press, belt scroll)
- `EaglerForgeAdapter` — binds to Eaglercraft's ModAPI event system, creates and
  owns a TickScheduler for the full 5-step tick ordering at 20 Hz.

### EaglerForge Python Bridge
- `PythonBridge` (JS) loads Pyodide from CDN, injects the EaglerCreate engine
  into Python's namespace, and provides `registerPythonBlock()` for Python
  blocks to register with the kinetic engine.
- `eaglerforge.py` (Python) provides `createblock(texture, command, rarity)`
  and `MyCustomBlock(texture, function, rarity)` — a Tkinter-style declarative
  API where modders define custom blocks with multi-face textures, interaction
  callbacks, and rarity attributes (any positive integer, no hardcoded cap).
- Python exceptions are caught and logged to the browser console with full
  tracebacks via `traceback.format_exc()`.

### Rendering
The test harness tries WebGL first (`WebGLModelRenderer`), falling back to
Canvas 2D (`CanvasModelRenderer`) if WebGL is unavailable. The 3D scene shows
a kinetic network: water wheel → shaft → cogwheel → large cogwheel → shaft →
mechanical press, all animating in real time.

## License
- Code: MIT License (Copyright (c) The Create Team / The Creators of Create)
- Assets: All Rights Reserved (Copyright (c) The Create Team / The Creators of Create)

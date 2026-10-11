# EaglerCreate

EaglerCreate is a port of the Create mod for Eaglercraft (browser-based Minecraft).
This repository contains the EaglerCreate injector bundle, asset pack, and a
Python SDK (EaglerForge) for defining custom blocks via a Tkinter-style declarative API.

## Repository Structure

- `eagler-create-injector (2).js` — The main EaglerCreate mod bundle (2740 lines).
  Exposes `globalThis.EaglerCreate` (kinetic engine, logistics, rendering) and
  `globalThis.EaglerCreateAssets` (embedded textures, models, registry).
- `eagler-create-assets.zip` — Create mod asset subset (29 textures, 41 models, OBJ files).
- `src/python/eaglerforge.py` — Python modding API: `createblock()` and `MyCustomBlock`.
- `src/client/eagler-forge-python.mjs` — Pyodide runtime bridge (JS↔Python event bridge).
- `test/index.html` — Test harness page (3D scene + Python code editor + console).
- `test/scene.js` — 3D scene setup, WebGL/Canvas renderer, animation loop.
- `test/harness.js` — Main test harness logic (Pyodide loading, UI, test runner).
- `test/tests/test_blocks.py` — Python unit tests for the modding API.

## Running the Test Harness

```bash
docker compose -f docker-compose.base44.yml up -d
```

Then open the preview at port 3000. The test harness page is at `/test/index.html`.

## Architecture

### EaglerCreate Engine (JavaScript)
The injector bundle provides:
- `KineticEngine` — physics simulation (RPM, stress, capacity, networks)
- `KineticBlock` — shaft, cog, gearbox, source, consumer block types
- `BeltTrack`, `Depot`, `Funnel`, `Chute` — item logistics
- `RecipeEngine`, `ProcessingMachine`, `MechanicalCrafterGrid` — crafting
- `ModelBuilder` — compiles Minecraft model JSON to triangle meshes
- `WebGLModelRenderer` / `CanvasModelRenderer` — 3D rendering (WebGL preferred, Canvas 2D fallback)
- `AnimationBridge` — animates block models (rotation, press, belt scroll)
- `EaglerForgeAdapter` — binds to Eaglercraft's ModAPI event system

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

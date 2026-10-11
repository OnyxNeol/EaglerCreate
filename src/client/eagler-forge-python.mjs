// src/client/eagler-forge-python.mjs
// EaglerCreate Python Runtime Bridge — Pyodide integration for EaglerForge.
//
// Provides a bidirectional JavaScript-to-Python event bridge so Python
// script functions can execute on client ticks, block interactions, and
// item placements. Python-defined blocks register directly with the
// EaglerCreate kinetic engine via registerPythonBlock().
//
// MIT License. Copyright (c) The Create Team / The Creators of Create.

const PYODIDE_VERSION = "0.26.2";
const PYODIDE_INDEX = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

/**
 * PythonBridge — manages a Pyodide runtime and connects Python-defined
 * blocks to the EaglerCreate kinetic engine.
 */
globalThis.PythonBridge = class PythonBridge {
  /**
   * @param {object} engine  The EaglerCreate KineticEngine singleton.
   * @param {object} assets  The EaglerCreateAssets object (registry, models, textures).
   * @param {object} [options]
   * @param {function} [options.onLog]   Called with informational log strings.
   * @param {function} [options.onError] Called with error strings (including Python tracebacks).
   */
  constructor(engine, assets, options = {}) {
    this.engine = engine;
    this.assets = assets;
    this.pyodide = null;
    this._loaded = false;
    this._blockDefs = new Map();       // blockId -> definition object
    this._pythonCallbacks = new Map(); // blockId -> Pyodide callable
    this._onLog = options.onLog ?? ((msg) => console.log(`[EaglerForge] ${msg}`));
    this._onError = options.onError ?? ((msg) => console.error(`[EaglerForge] ${msg}`));
  }

  // -- Loading -----------------------------------------------------------

  /**
   * Load Pyodide, inject the eaglerforge.py API, and wire the bridge.
   * Resolves when the Python runtime is ready to execute mod scripts.
   */
  async load() {
    this._onLog("Loading Pyodide runtime…");
    await this._loadScript(PYODIDE_INDEX + "pyodide.js");
    const pyodide = await self.loadPyodide({ indexURL: PYODIDE_INDEX });
    this.pyodide = pyodide;

    // Expose JS objects into Python's global scope so eaglerforge.py can call them.
    pyodide.globals.set("_eagler_create_engine", this.engine);
    pyodide.globals.set("_eagler_create_assets", this.assets);
    pyodide.globals.set("_eagler_python_bridge", this);

    // Load the eaglerforge.py API from the server.
    const resp = await fetch("/src/python/eaglerforge.py");
    if (!resp.ok) throw new Error(`Failed to fetch eaglerforge.py: ${resp.status}`);
    const apiCode = await resp.text();
    pyodide.FS.writeFile("/home/pyodide/eaglerforge.py", apiCode);

    // Import the module so createblock / MyCustomBlock are available.
    pyodide.runPython(`
import sys
sys.path.insert(0, '/home/pyodide')
import eaglerforge
    `);

    this._loaded = true;
    this._onLog("Pyodide runtime ready.");
    return this;
  }

  /**
   * Execute a Python script string (sync). Exceptions are logged with
   * full traceback via _logTraceback.
   */
  runPython(code) {
    this._ensureLoaded();
    try {
      return this.pyodide.runPython(code);
    } catch (error) {
      this._logTraceback(error, "runPython");
      throw error;
    }
  }

  /**
   * Execute a Python script string asynchronously. Use for scripts that
   * may await or import packages.
   */
  async runPythonAsync(code) {
    this._ensureLoaded();
    try {
      return await this.pyodide.runPythonAsync(code);
    } catch (error) {
      this._logTraceback(error, "runPythonAsync");
      throw error;
    }
  }

  /**
   * Load and execute a .py file from a URL.
   */
  async runPythonFile(url) {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Failed to fetch ${url}: ${resp.status}`);
    const code = await resp.text();
    return this.runPythonAsync(code);
  }

  // -- Block registration (called from Python via the js bridge) ---------

  /**
   * Register a Python-defined block with the EaglerCreate engine.
   * Called from eaglerforge.py via `js._eagler_python_bridge.registerPythonBlock(…)`.
   *
   * @param {object} definition
   * @param {string} definition.id        Unique block id (e.g. "python:steam_engine_1").
   * @param {string[]|null} definition.texture  6-element texture face array or null.
   * @param {*} definition.command        Python callable (Pyodide-wrapped) or null.
   * @param {number} definition.rarity    Positive integer rarity.
   * @param {string} definition.kind      Kinetic block kind.
   * @param {object} definition.config    KineticBlock constructor config.
   * @returns {string} The block id.
   */
  registerPythonBlock(definition) {
    const { id, texture, command, rarity, kind, config } = definition;

    // Register the kinetic block type in the engine.
    if (!this.engine.hasKineticBlock(id)) {
      this.engine.registerKineticBlock(id, config);
    }

    // Store the Python callback for event dispatch.
    if (command != null) {
      this._pythonCallbacks.set(id, command);
    }

    // Store the full definition.
    this._blockDefs.set(id, { id, texture, rarity, kind, config });

    // Register a render definition in the assets registry if we have textures.
    if (texture) {
      this._registerRenderDefinition(id, texture);
    }

    this._onLog(`Registered Python block: ${id} (rarity: ${rarity}, kind: ${kind})`);
    return id;
  }

  // -- Event dispatch (called from JS engine events) ---------------------

  /**
   * Dispatch a tick event to all Python blocks that have a callback.
   * @param {number} dt  Delta seconds.
   */
  tick(dt) {
    for (const [blockId, callback] of this._pythonCallbacks) {
      try {
        if (typeof callback === "function" || callback?.call) {
          callback(dt);
        }
      } catch (error) {
        this._logTraceback(error, `tick:${blockId}`);
      }
    }
  }

  /**
   * Dispatch a block interaction event to a specific Python block.
   * @param {string} blockId
   * @param {string} eventType  "place" | "break" | "interact"
   * @param {...any} args       Event data from the engine.
   */
  dispatchEvent(blockId, eventType, ...args) {
    const callback = this._pythonCallbacks.get(blockId);
    if (!callback) return;
    try {
      callback(...args);
    } catch (error) {
      this._logTraceback(error, `${eventType}:${blockId}`);
    }
  }

  // -- Introspection -----------------------------------------------------

  /** Returns a map of all registered Python block definitions. */
  get registeredBlocks() {
    return new Map(this._blockDefs);
  }

  /** Returns the number of Python-defined blocks. */
  get blockCount() {
    return this._blockDefs.size;
  }

  // -- Internal ----------------------------------------------------------

  _ensureLoaded() {
    if (!this._loaded) throw new Error("PythonBridge not loaded — call load() first");
  }

  /**
   * Add a render definition to the assets registry so AnimationBridge
   * can render the Python block. Uses a simple static cube model with
   * per-face textures.
   */
  _registerRenderDefinition(blockId, textures) {
    const registry = this.assets.registry;
    if (!registry) return;

    // Build a cube model with per-face textures.
    const faceNames = ["up", "down", "north", "south", "west", "east"];
    const faces = {};
    for (let i = 0; i < 6; i++) {
      faces[faceNames[i]] = { texture: `#${i}`, cullface: faceNames[i] };
    }

    const modelId = `python:block/${blockId.replace(":", "/")}`;
    const textureMap = {};
    for (let i = 0; i < 6; i++) {
      textureMap[String(i)] = textures[i];
    }

    // Register the model in assets.models.
    if (!this.assets.models) this.assets.models = {};
    this.assets.models[modelId] = {
      parent: "minecraft:block/cube",
      textures: textureMap,
      elements: [{
        from: [0, 0, 0],
        to: [16, 16, 16],
        faces,
      }],
    };

    // Register the block in the render registry.
    registry[blockId] = {
      parts: [{ model: modelId, motion: "static" }],
    };

    this._onLog(`Registered render definition for ${blockId}`);
  }

  /**
   * Log a Python traceback to the browser console with full context.
   * Pyodide errors carry the Python traceback in the message.
   */
  _logTraceback(error, context = "") {
    const prefix = context ? `[EaglerForge Python ${context}]` : "[EaglerForge Python]";
    const message = error?.message ?? String(error);
    this._onError(`${prefix}\n${message}`);

    // If Pyodide is loaded, try to get the full traceback.
    if (this.pyodide) {
      try {
        const tb = this.pyodide.runPython("import traceback; traceback.format_exc()");
        if (tb && tb.trim() !== "None") {
          this._onError(`${prefix} Python traceback:\n${tb}`);
        }
      } catch {
        // Ignore — traceback extraction is best-effort.
      }
    }
  }

  _loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
      document.head.appendChild(script);
    });
  }

  /** Clean up the bridge and release Pyodide resources. */
  dispose() {
    this._pythonCallbacks.clear();
    this._blockDefs.clear();
    this.pyodide = null;
    this._loaded = false;
  }
}

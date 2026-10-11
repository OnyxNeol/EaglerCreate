// src/client/create-blocks.js
// Registers Create mod blocks as native Minecraft blocks via Eaglercraft's
// ModAPI reflection system, then configures the EaglerCreateInjector with a
// WebGL/Canvas renderer so the injector status reaches "ready".
//
// This script is externalized by scripts/prepare-client.mjs and loaded after
// the EaglerCreate injector bundle (dist/eagler-create.js).
//
// MIT License. Copyright (c) The Create Team / The Creators of Create.

(function () {
  'use strict';

  // ---- Block definitions matching the injector's DEFAULT_BLOCKS ----
  var CREATE_BLOCKS = [
    { id: 'shaft',            material: 'rock',  hardness: 3, config: { kind: 'shaft' } },
    { id: 'cogwheel',         material: 'rock',  hardness: 3, config: { kind: 'cog', gearRadius: 1 } },
    { id: 'large_cogwheel',   material: 'rock',  hardness: 3, config: { kind: 'cog', gearRadius: 2 } },
    { id: 'water_wheel',     material: 'wood',  hardness: 2, config: { kind: 'source', isSource: true, sourceSpeed: 32, capacity: 8 } },
    { id: 'mechanical_press', material: 'iron', hardness: 4, config: { kind: 'consumer', stress: 8 } },
    { id: 'gearbox',         material: 'rock',  hardness: 3, config: { kind: 'gearbox', facing: { x: 0, y: 1, z: 0 } } }
  ];

  var log = function (msg) { console.log('[EaglerCreate Blocks] ' + msg); };
  var warn = function (msg) { console.warn('[EaglerCreate Blocks] ' + msg); };

  // ---- Wait for ModAPI bootstrap, then register blocks ----
  function onBootstrap() {
    if (!window.ModAPI || typeof ModAPI.addEventListener !== 'function') {
      warn('ModAPI not available, retrying in 500ms…');
      setTimeout(onBootstrap, 500);
      return;
    }

    // ModAPI.bootstrap() populates ModAPI.blocks, ModAPI.materials, etc.
    // The bootstrap event fires after that. If blocks aren't ready yet,
    // wait for the event.
    if (!ModAPI.blocks || !ModAPI.materials) {
      log('Waiting for bootstrap event…');
      ModAPI.addEventListener('bootstrap', registerBlocks);
    } else {
      registerBlocks();
    }
  }

  function registerBlocks() {
    log('ModAPI bootstrap complete, registering Create blocks…');

    var EC = window.EaglerCreate;
    var ECA = window.EaglerCreateAssets;
    if (!EC || !ECA) {
      warn('EaglerCreate engine or assets not loaded.');
      return;
    }

    var BlockClass = ModAPI.reflect.getClassById('net.minecraft.block.Block');
    var blockRegistry = ModAPI.is_1_12
      ? BlockClass.staticVariables.REGISTRY
      : BlockClass.staticVariables.blockRegistry;

    // Get the register method from the hooked RegistryNamespaced
    var registerMethod = ModAPI.hooks.methods[
      ModAPI.util.getMethodFromPackage('net.minecraft.util.RegistryNamespaced', 'register')
    ];

    // Find a Block constructor that accepts a Material (1.8: Block(Material))
    var constructors = BlockClass.constructors;
    var blockCtor = null;
    for (var i = 0; i < constructors.length; i++) {
      if (constructors[i].length === 2 || constructors[i].length === 1) {
        blockCtor = constructors[i];
        break;
      }
    }
    if (!blockCtor) {
      warn('No suitable Block constructor found, using fallback binding strategy.');
      configureInjector(EC, ECA, []);
      return;
    }

    var bindings = [];
    var registered = 0;

    for (var i = 0; i < CREATE_BLOCKS.length; i++) {
      var def = CREATE_BLOCKS[i];
      var blockName = 'create:' + def.id;

      try {
        // Generate a unique numeric block ID
        var blockId = ModAPI.keygen.block(blockName);
        if (blockId < 0) {
          warn('Could not generate ID for ' + blockName + ', skipping.');
          continue;
        }

        // Create the block instance: Block(Material)
        var material = ModAPI.materials[def.material] || ModAPI.materials.rock;
        var block = blockCtor(material);

        // Set block properties via reflection
        // setBlockName(String) → unlocalised name
        // setHardness(float) / setResistance(float)
        // setCreativeTab(CreativeTabs.tabBlock) for creative inventory
        try {
          var nameStr = ModAPI.util.str(blockName);
          var setBlockName = ModAPI.hooks.methods[
            ModAPI.util.getMethodFromPackage('net.minecraft.block.Block', 'setBlockName')
          ];
          if (setBlockName) setBlockName.call(block, nameStr);
        } catch (e) { /* non-fatal */ }

        try {
          var setHardness = ModAPI.hooks.methods[
            ModAPI.util.getMethodFromPackage('net.minecraft.block.Block', 'setHardness')
          ];
          if (setHardness) setHardness.call(block, def.hardness);
        } catch (e) { /* non-fatal */ }

        // Register in the block registry: registry.register(id, name, block)
        // In TeaVM, `this` is passed as the first argument.
        registerMethod.call(blockRegistry, blockId, ModAPI.util.str(blockName), block);

        bindings.push({
          id: def.id,
          config: def.config,
          minecraftBlock: block
        });
        registered++;
        log('Registered ' + blockName + ' (id: ' + blockId + ')');
      } catch (e) {
        warn('Failed to register ' + blockName + ': ' + (e.message || e));
      }
    }

    log('Registered ' + registered + '/' + CREATE_BLOCKS.length + ' Create blocks.');
    configureInjector(EC, ECA, bindings);
  }

  // ---- Configure the EaglerCreateInjector with blocks + renderer ----
  function configureInjector(EC, ECA, bindings) {
    var injector = window.EaglerCreateInjector;
    if (!injector) {
      warn('EaglerCreateInjector not found.');
      return;
    }

    // Build the renderer: AnimationBridge backed by WebGL or Canvas
    var renderer = createRenderer(EC, ECA);
    if (!renderer) {
      warn('Could not create renderer; configuring without one.');
    }

    // Supply getWorld() from ModAPI
    function getWorld() {
      try {
        if (ModAPI.javaClient && ModAPI.javaClient.$theWorld) {
          return ModAPI.javaClient.$theWorld;
        }
        if (ModAPI.world) return ModAPI.world;
      } catch (e) { /* world not ready yet */ }
      return null;
    }

    var options = {
      ModAPI: ModAPI,
      blocks: bindings.length > 0 ? bindings : undefined,
      renderer: renderer,
      getWorld: getWorld,
      onWarning: function (diag) {
        warn('Adapter: ' + diag.code + ' — ' + diag.message);
      }
    };

    // Store options so the async renderer reconfiguration can reuse them
    window.__eaglerCreateOptions = options;

    log('Configuring EaglerCreateInjector with ' +
        (bindings.length > 0 ? bindings.length + ' block bindings' : 'default blocks') +
        ' and ' + (renderer ? 'renderer' : 'no renderer') + '…');

    injector.configure(options);

    // Check status after a short delay (configure is async — it polls for ModAPI)
    setTimeout(function checkStatus() {
      var status = injector.status;
      log('Injector status: ' + status);
      if (status === 'integration-required') {
        var missing = injector.missingBlocks;
        if (missing && missing.length > 0) {
          warn('Missing blocks: ' + missing.join(', '));
        }
        if (!injector.adapter || !injector.adapter.capabilities.render) {
          warn('Render capability not active.');
        }
      } else if (status === 'ready') {
        log('All Create blocks registered and injector is ready!');
      }
    }, 2000);
  }

  // ---- Create the AnimationBridge renderer with WebGL or Canvas backend ----
  function createRenderer(EC, ECA) {
    try {
      // Build a ModelBuilder from the assets
      var builder = new EC.ModelBuilder(ECA);

      // Try WebGL first, fall back to Canvas 2D
      var canvas = document.createElement('canvas');
      canvas.width = 300;
      canvas.height = 300;
      canvas.style.position = 'fixed';
      canvas.style.top = '0';
      canvas.style.left = '0';
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.pointerEvents = 'none';
      canvas.style.zIndex = '100';

      var glRenderer = null;
      var canvasRenderer = null;
      var drawFn = null;

      // Load textures asynchronously, then create the renderer
      // loadModelTextures returns a Map of texture id → {image, placeholder, metadata}
      EC.loadModelTextures(ECA, { allowPlaceholders: true }).then(function (textures) {
        try {
          glRenderer = new EC.WebGLModelRenderer(canvas, textures);
          drawFn = function (mesh, matrix, record, part) {
            glRenderer.draw(mesh, matrix, record, part);
          };
          log('WebGL renderer created.');
        } catch (e) {
          warn('WebGL renderer failed: ' + (e.message || e) + ', trying Canvas 2D.');
          try {
            canvasRenderer = new EC.CanvasModelRenderer(canvas, textures);
            drawFn = function (mesh, matrix, record, part) {
              canvasRenderer.draw(mesh, matrix, record, part);
            };
            log('Canvas 2D renderer created.');
          } catch (e2) {
            warn('Canvas 2D renderer also failed: ' + (e2.message || e2));
            return;
          }
        }

        // Create the AnimationBridge with the builder, asset registry, and draw function
        var bridge = new EC.AnimationBridge({
          builder: builder,
          registry: ECA.registry,
          draw: drawFn,
          beginFrame: function (partial) {
            var r = glRenderer || canvasRenderer;
            if (r) r.beginFrame(partial);
          },
          endFrame: function (partial) {
            var r = glRenderer || canvasRenderer;
            if (r) r.endFrame(partial);
          }
        });

        // Store on global for the injector to use
        window.__eaglerCreateRenderer = bridge;
        window.__eaglerCreateCanvas = canvas;

        // Reconfigure the injector now that the renderer is ready
        var injector = window.EaglerCreateInjector;
        if (injector && injector.status === 'integration-required') {
          log('Renderer ready, reconfiguring injector with AnimationBridge…');
          var prevOptions = window.__eaglerCreateOptions || {};
          injector.configure(Object.assign({}, prevOptions, { renderer: bridge }));
        }
      }).catch(function (e) {
        warn('Texture loading failed: ' + (e.message || e));
      });

      // Return a lightweight renderer stub that delegates to the bridge once ready
      // The adapter calls setRotation, beginFrame, endFrame, captureTick, remove
      return {
        setRotation: function (block, angle, partial) {
          var bridge = window.__eaglerCreateRenderer;
          if (bridge) bridge.setRotation(block, angle, partial);
        },
        beginFrame: function (partial) {
          var bridge = window.__eaglerCreateRenderer;
          if (bridge) bridge.beginFrame(partial);
        },
        endFrame: function (partial) {
          var bridge = window.__eaglerCreateRenderer;
          if (bridge) bridge.endFrame(partial);
        },
        captureTick: function (dt) {
          var bridge = window.__eaglerCreateRenderer;
          if (bridge) bridge.captureTick(dt);
          var r = glRenderer || canvasRenderer;
          if (r && r.captureTick) r.captureTick(dt);
        },
        remove: function (block) {
          var bridge = window.__eaglerCreateRenderer;
          if (bridge) bridge.remove(block);
        }
      };
    } catch (e) {
      warn('Renderer creation failed: ' + (e.message || e));
      return null;
    }
  }

  // ---- Kick off ----
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onBootstrap);
  } else {
    onBootstrap();
  }
})();

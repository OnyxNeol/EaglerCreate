// Registers ALL Create mod blocks and items as native Minecraft objects
// via Eaglercraft's ModAPI reflection system. Injects proper display names
// into the language map and hooks ModelBakery.loadModel so Create model
// JSONs from EaglerCreateAssets are used for in-game rendering.
//
// This script is externalized by scripts/prepare-client.mjs and loaded after
// the EaglerCreate injector bundle (dist/eagler-create.js) and create-catalog.js.
//
// MIT License. Copyright (c) The Create Team / The Creators of Create.

(function () {
  'use strict';

  var catalog = globalThis.CreateCatalog;
  if (!catalog) { console.warn('[EaglerCreate Blocks] create-catalog.js not loaded.'); return; }

  // Keep registration diagnostics available after noisy vanilla startup logs.
  var registration = window.EaglerCreateBlockRegistration = { registered: [], errors: [] };
  var log = function (msg) { console.log('[EaglerCreate Blocks] ' + msg); };
  var warn = function (msg) {
    registration.errors.push(msg);
    console.warn('[EaglerCreate Blocks] ' + msg);
  };

  // ---- Wait for ModAPI bootstrap, then register everything ----
  function onBootstrap() {
    if (!window.ModAPI || typeof ModAPI.addEventListener !== 'function') {
      warn('ModAPI not available, retrying in 500ms…');
      setTimeout(onBootstrap, 500);
      return;
    }

    if (!ModAPI.blocks || !ModAPI.materials) {
      log('Waiting for bootstrap event…');
      ModAPI.addEventListener('bootstrap', registerAll);
    } else {
      registerAll();
    }
  }

  function registerAll() {
    log('ModAPI bootstrap complete, registering all Create items…');

    var EC = window.EaglerCreate;
    var ECA = window.EaglerCreateAssets;
    if (!EC || !ECA) { warn('EaglerCreate engine or assets not loaded.'); return; }

    // ---- Resolve shared reflection objects ----
    var BlockClass = ModAPI.reflect.getClassById('net.minecraft.block.Block');
    if (!BlockClass) { warn('Block class not found.'); return; }

    var blockRegistry = ModAPI.is_1_12
      ? BlockClass.staticVariables.REGISTRY
      : BlockClass.staticVariables.blockRegistry;
    if (!blockRegistry) { warn('Block registry not found.'); return; }

    var ItemClass = ModAPI.reflect.getClassById('net.minecraft.item.Item');
    var itemRegistry = ItemClass
      ? (ModAPI.is_1_12 ? ItemClass.staticVariables.REGISTRY : ItemClass.staticVariables.itemRegistry)
      : null;

    var registerMethod = ModAPI.hooks.methods[
      ModAPI.util.getMethodFromPackage('net.minecraft.util.RegistryNamespaced', 'register')
    ];
    if (!registerMethod) { warn('RegistryNamespaced.register not found.'); return; }

    var ResourceLocationClass = ModAPI.reflect.getClassById('net.minecraft.util.ResourceLocation');
    var resourceLocationCtor = ResourceLocationClass && ResourceLocationClass.constructors.find(function (c) { return c.length === 1; });
    if (!resourceLocationCtor) { warn('ResourceLocation constructor not found.'); return; }

    // Block methods
    var setUnlocalizedName = ModAPI.hooks.methods[
      ModAPI.util.getMethodFromPackage('net.minecraft.block.Block', 'setUnlocalizedName')];
    var setHardness = ModAPI.hooks.methods[
      ModAPI.util.getMethodFromPackage('net.minecraft.block.Block', 'setHardness')];
    var setCreativeTab = ModAPI.hooks.methods[
      ModAPI.util.getMethodFromPackage('net.minecraft.block.Block', 'setCreativeTab')];
    var registerItemBlock = ModAPI.hooks.methods[
      ModAPI.util.getMethodFromPackage('net.minecraft.item.Item', 'registerItemBlock0')];

    // Item methods
    var itemSetUnlocalizedName = ModAPI.hooks.methods[
      ModAPI.util.getMethodFromPackage('net.minecraft.item.Item', 'setUnlocalizedName')];
    var itemSetCreativeTab = ModAPI.hooks.methods[
      ModAPI.util.getMethodFromPackage('net.minecraft.item.Item', 'setCreativeTab')];
    var itemRegister = ModAPI.hooks.methods[
      ModAPI.util.getMethodFromPackage('net.minecraft.item.Item', 'registerItem')];

    // Creative tabs
    var CreativeTabsClass = ModAPI.reflect.getClassById('net.minecraft.creativetab.CreativeTabs');
    var tabBlock = CreativeTabsClass ? CreativeTabsClass.staticVariables.tabBlock : null;
    var tabMaterials = CreativeTabsClass ? CreativeTabsClass.staticVariables.tabMaterials : null;
    var tabTools = CreativeTabsClass ? CreativeTabsClass.staticVariables.tabTools : null;

    // Block constructor: Block(Material)
    var blockCtor = null;
    for (var i = 0; i < BlockClass.constructors.length; i++) {
      if (BlockClass.constructors[i].length === 1) { blockCtor = BlockClass.constructors[i]; break; }
    }
    if (!blockCtor) { warn('No single-arg Block constructor found.'); return; }

    // Item constructor: Item() — use ripped constructors directly
    var itemCtor = null;
    if (ItemClass && ItemClass.constructors) {
      for (var j = 0; j < ItemClass.constructors.length; j++) {
        if (ItemClass.constructors[j].length === 0) { itemCtor = ItemClass.constructors[j]; break; }
      }
    }
    // Fallback: look up in ripped constructors by compiled name
    if (!itemCtor) {
      var itemInitKey = ModAPI.util.getCompiledName('net.minecraft.item.Item') + '__init_0';
      itemCtor = ModAPI.hooks._rippedConstructors[itemInitKey];
    }

    // ---- Hook ModelBakery.loadModel for Create textures ----
    hookModelBakery(ECA);

    // ---- Register blocks ----
    var bindings = [];
    var registered = 0;

    for (var bi = 0; bi < catalog.BLOCKS.length; bi++) {
      var bdef = catalog.BLOCKS[bi];
      var blockName = 'create:' + bdef.id;

      try {
        var blockId = ModAPI.keygen.block(blockName);
        if (blockId < 0) { warn('Could not generate ID for ' + blockName); continue; }

        var material = ModAPI.materials[bdef.material] || ModAPI.materials.rock;
        var block = blockCtor(material.getRef());
        if (!block) { warn('Block ctor returned null for ' + blockName); continue; }

        try { if (setUnlocalizedName) setUnlocalizedName(block, ModAPI.util.str(blockName)); } catch (e) {}
        try { if (setHardness) setHardness(block, bdef.hardness); } catch (e) {}
        try { if (setCreativeTab && tabBlock) setCreativeTab(block, tabBlock); } catch (e) {}

        registerMethod(blockRegistry, blockId, resourceLocationCtor(ModAPI.util.str(blockName)), block);

        try { if (registerItemBlock) registerItemBlock(block); } catch (e) {
          warn('ItemBlock failed for ' + blockName + ': ' + (e.message || e));
        }

        if (bdef.kind === 'kinetic') {
          bindings.push({ id: bdef.id, config: bdef.config, minecraftBlock: block });
        }
        registered++;
        registration.registered.push(blockName);
        log('Registered block ' + blockName + ' (id: ' + blockId + ') — ' + bdef.name);
      } catch (e) {
        warn('Failed to register block ' + blockName + ': ' + (e.message || e));
      }
    }

    // ---- Register standalone items ----
    for (var ii = 0; ii < catalog.ITEMS.length; ii++) {
      var idef = catalog.ITEMS[ii];
      var itemName = 'create:' + idef.id;

      try {
        if (!itemCtor || !itemRegistry) {
          log('Item registration unavailable, skipping ' + itemName);
          continue;
        }

        var itemId = ModAPI.keygen.item(itemName);
        if (itemId < 0) { warn('Could not generate item ID for ' + itemName); continue; }

        var item = itemCtor();
        if (!item) { warn('Item ctor returned null for ' + itemName); continue; }

        try { if (itemSetUnlocalizedName) itemSetUnlocalizedName(item, ModAPI.util.str(itemName)); } catch (e) {}
        try { if (itemSetCreativeTab && tabMaterials) itemSetCreativeTab(item, tabMaterials); } catch (e) {}

        // Register directly in the item registry (same pattern as blocks)
        registerMethod(itemRegistry, itemId, resourceLocationCtor(ModAPI.util.str(itemName)), item);

        registered++;
        registration.registered.push(itemName);
        log('Registered item ' + itemName + ' (id: ' + itemId + ') — ' + idef.name);
      } catch (e) {
        warn('Failed to register item ' + itemName + ': ' + (e.message || e));
      }
    }

    // ---- Inject display names into the language map ----
    injectDisplayNames();

    log('Registered ' + registered + ' Create items total.');
    configureInjector(EC, ECA, bindings);
  }

  // ---- Inject human-readable display names into Eaglercraft's language map ----
  function injectDisplayNames() {
    try {
      var StatCollector = ModAPI.reflect.getClassById('net.minecraft.util.StatCollector');
      if (!StatCollector) { warn('StatCollector not found.'); return; }
      var stringTranslate = StatCollector.staticVariables.localizedName;
      if (!stringTranslate) { warn('StringTranslate instance not found.'); return; }
      var langMap = stringTranslate.$languageList;
      if (!langMap) { warn('Language map not found.'); return; }

      var hashMapPut = ModAPI.hooks.methods[
        ModAPI.util.getMethodFromPackage('java.util.HashMap', 'put')];
      if (!hashMapPut) { warn('HashMap.put not found.'); return; }

      var injected = 0;

      // Block names: Block.getUnlocalizedName() returns "tile." + unlocalizedName,
      // so the translation key is "tile.create:shaft.name" → "Shaft"
      for (var bi = 0; bi < catalog.BLOCKS.length; bi++) {
        var bdef = catalog.BLOCKS[bi];
        var key = 'tile.create:' + bdef.id + '.name';
        try {
          hashMapPut(langMap, ModAPI.util.str(key), ModAPI.util.str(bdef.name));
          injected++;
        } catch (e) { /* non-fatal */ }
      }

      // Item names: Item.getUnlocalizedName() returns "item." + unlocalizedName
      for (var ii = 0; ii < catalog.ITEMS.length; ii++) {
        var idef = catalog.ITEMS[ii];
        var ikey = 'item.create:' + idef.id + '.name';
        try {
          hashMapPut(langMap, ModAPI.util.str(ikey), ModAPI.util.str(idef.name));
          injected++;
        } catch (e) { /* non-fatal */ }
      }

      log('Injected ' + injected + ' display name translations.');
    } catch (e) {
      warn('Language map injection failed: ' + (e.message || e));
    }
  }

  // ---- Hook ModelBakery.loadModel to serve Create model JSONs from EaglerCreateAssets ----
  function hookModelBakery(ECA) {
    var modelKey = 'nmcrm_ModelBakery_loadModel';
    var originalLoadModel = ModAPI.hooks.methods[modelKey];
    if (!originalLoadModel) { warn('ModelBakery.loadModel not found.'); return; }

    var deserialize = ModAPI.hooks.methods[
      ModAPI.util.getMethodFromPackage('net.minecraft.client.renderer.block.model.ModelBlock', 'deserialize')];
    if (!deserialize) { warn('ModelBlock.deserialize not found.'); return; }

    var models = ECA.models || {};
    var hooked = 0;

    ModAPI.hooks.methods[modelKey] = function ($this, $rl) {
      try {
        if ($rl && $rl.$resourceDomain) {
          // $rl.$resourceDomain is a TeaVM string; convert to JS
          var domain = ModAPI.util.unstr($rl.$resourceDomain);
          if (domain === 'create') {
            var path = ModAPI.util.unstr($rl.$resourcePath);
            // ModelBakery passes paths like "block/shaft" — match to "create:block/shaft"
            var modelId = 'create:' + path;
            var modelJson = models[modelId];
            if (modelJson) {
              var jsonStr = JSON.stringify(modelJson);
              var modelBlock = deserialize(ModAPI.util.str(jsonStr));
              if (modelBlock) {
                // Set the model name (loadModel does: modelBlock.name = rl.toString())
                try { modelBlock.$name70 = $rl.$toString ? $rl.$toString() : ModAPI.util.str(modelId); } catch (e) {}
                hooked++;
                return modelBlock;
              }
            }
          }
        }
      } catch (e) {
        // Fall through to original on any error
      }
      return originalLoadModel.call(this, $this, $rl);
    };

    log('ModelBakery.loadModel hooked for Create textures (' + Object.keys(models).length + ' models available).');
  }

  // ---- Configure the EaglerCreateInjector with blocks + renderer ----
  function configureInjector(EC, ECA, bindings) {
    var injector = window.EaglerCreateInjector;
    if (!injector) { warn('EaglerCreateInjector not found.'); return; }

    var renderer = createRenderer(EC, ECA);
    if (!renderer) { warn('Could not create renderer; configuring without one.'); }

    function getWorld() {
      try {
        if (ModAPI.javaClient && ModAPI.javaClient.$theWorld) return ModAPI.javaClient.$theWorld;
        if (ModAPI.world) return ModAPI.world;
      } catch (e) {}
      return null;
    }

    var options = {
      ModAPI: ModAPI,
      blocks: bindings.length > 0 ? bindings : undefined,
      renderer: renderer,
      getWorld: getWorld,
      onWarning: function (diag) { warn('Adapter: ' + diag.code + ' — ' + diag.message); }
    };

    window.__eaglerCreateOptions = options;

    log('Configuring EaglerCreateInjector with ' +
        (bindings.length > 0 ? bindings.length + ' block bindings' : 'default blocks') +
        ' and ' + (renderer ? 'renderer' : 'no renderer') + '…');

    injector.configure(options);

    setTimeout(function () {
      var status = injector.status;
      log('Injector status: ' + status);
      if (status === 'ready') log('All Create blocks registered and injector is ready!');
    }, 2000);
  }

  // ---- Create the AnimationBridge renderer with WebGL or Canvas backend ----
  function createRenderer(EC, ECA) {
    try {
      var builder = new EC.ModelBuilder(ECA);
      var canvas = document.createElement('canvas');
      canvas.width = 300; canvas.height = 300;
      canvas.style.position = 'fixed'; canvas.style.top = '0'; canvas.style.left = '0';
      canvas.style.width = '100%'; canvas.style.height = '100%';
      canvas.style.pointerEvents = 'none'; canvas.style.zIndex = '100';

      var glRenderer = null, canvasRenderer = null, drawFn = null;

      EC.loadModelTextures(ECA, { allowPlaceholders: true }).then(function (textures) {
        try {
          glRenderer = new EC.WebGLModelRenderer(canvas, textures);
          drawFn = function (mesh, matrix, record, part) { glRenderer.draw(mesh, matrix, record, part); };
          log('WebGL renderer created.');
        } catch (e) {
          warn('WebGL renderer failed: ' + (e.message || e) + ', trying Canvas 2D.');
          try {
            canvasRenderer = new EC.CanvasModelRenderer(canvas, textures);
            drawFn = function (mesh, matrix, record, part) { canvasRenderer.draw(mesh, matrix, record, part); };
            log('Canvas 2D renderer created.');
          } catch (e2) { warn('Canvas 2D renderer also failed: ' + (e2.message || e2)); return; }
        }

        var bridge = new EC.AnimationBridge({
          builder: builder, registry: ECA.registry, draw: drawFn,
          beginFrame: function (p) { var r = glRenderer || canvasRenderer; if (r) r.beginFrame(p); },
          endFrame: function (p) { var r = glRenderer || canvasRenderer; if (r) r.endFrame(p); }
        });

        window.__eaglerCreateRenderer = bridge;
        window.__eaglerCreateCanvas = canvas;

        var injector = window.EaglerCreateInjector;
        if (injector && injector.status === 'integration-required') {
          log('Renderer ready, reconfiguring injector with AnimationBridge…');
          var prevOptions = window.__eaglerCreateOptions || {};
          injector.configure(Object.assign({}, prevOptions, { renderer: bridge }));
        }
      }).catch(function (e) { warn('Texture loading failed: ' + (e.message || e)); });

      return {
        setRotation: function (b, a, p) { var br = window.__eaglerCreateRenderer; if (br) br.setRotation(b, a, p); },
        beginFrame: function (p) { var br = window.__eaglerCreateRenderer; if (br) br.beginFrame(p); },
        endFrame: function (p) { var br = window.__eaglerCreateRenderer; if (br) br.endFrame(p); },
        captureTick: function (dt) {
          var br = window.__eaglerCreateRenderer; if (br) br.captureTick(dt);
          var r = glRenderer || canvasRenderer; if (r && r.captureTick) r.captureTick(dt);
        },
        remove: function (b) { var br = window.__eaglerCreateRenderer; if (br) br.remove(b); }
      };
    } catch (e) { warn('Renderer creation failed: ' + (e.message || e)); return null; }
  }

  // ---- Kick off ----
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onBootstrap);
  } else {
    onBootstrap();
  }
})();

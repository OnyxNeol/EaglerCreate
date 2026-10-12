// Full Create mod item catalog — display names, materials, and configs.
// Used by create-blocks.js to register all Create items with proper names
// and textures in Eaglercraft's native registry.
//
// MIT License. Copyright (c) The Create Team / The Creators of Create.

(function () {
  'use strict';

  // ---- Blocks (registered via Block registry + ItemBlock) ----
  // kind: 'kinetic' = passed to EaglerCreate engine; 'ore' = inventory only;
  //       'decor' = decorative block, no kinetic behavior
  var BLOCKS = [
    // Kinetic
    { id: 'shaft',            material: 'rock',  hardness: 3, kind: 'kinetic', config: { kind: 'shaft' }, name: 'Shaft' },
    { id: 'cogwheel',         material: 'rock',  hardness: 3, kind: 'kinetic', config: { kind: 'cog', gearRadius: 1 }, name: 'Cogwheel' },
    { id: 'large_cogwheel',   material: 'rock',  hardness: 3, kind: 'kinetic', config: { kind: 'cog', gearRadius: 2 }, name: 'Large Cogwheel' },
    { id: 'water_wheel',      material: 'wood',  hardness: 2, kind: 'kinetic', config: { kind: 'source', isSource: true, sourceSpeed: 32, capacity: 8 }, name: 'Water Wheel' },
    { id: 'large_water_wheel',material: 'wood',  hardness: 2, kind: 'kinetic', config: { kind: 'source', isSource: true, sourceSpeed: 64, capacity: 16 }, name: 'Large Water Wheel' },
    { id: 'mechanical_press', material: 'iron',  hardness: 4, kind: 'kinetic', config: { kind: 'consumer', stress: 8 }, name: 'Mechanical Press' },
    { id: 'mechanical_crafter',material: 'rock', hardness: 3, kind: 'kinetic', config: { kind: 'consumer', stress: 4 }, name: 'Mechanical Crafter' },
    { id: 'gearbox',          material: 'rock',  hardness: 3, kind: 'kinetic', config: { kind: 'gearbox', facing: { x: 0, y: 1, z: 0 } }, name: 'Gearbox' },
    { id: 'basin',            material: 'iron',  hardness: 3, kind: 'decor',   name: 'Basin' },
    { id: 'belt',             material: 'wood',  hardness: 2, kind: 'decor',   name: 'Belt' },
    // Casings & decorative
    { id: 'andesite_casing',  material: 'rock',  hardness: 3, kind: 'decor',   name: 'Andesite Casing' },
    { id: 'brass_casing',     material: 'iron',  hardness: 3, kind: 'decor',   name: 'Brass Casing' },
    { id: 'brass_block',      material: 'iron',  hardness: 3, kind: 'decor',   name: 'Block of Brass' },
    { id: 'industrial_iron_block', material: 'iron', hardness: 5, kind: 'decor', name: 'Industrial Iron Block' },
    // Ores
    { id: 'zinc_ore',           material: 'rock', hardness: 3, kind: 'ore',     name: 'Zinc Ore' },
    { id: 'deepslate_zinc_ore', material: 'rock', hardness: 3, kind: 'ore',     name: 'Deepslate Zinc Ore' }
  ];

  // ---- Items (registered via Item registry, no block form) ----
  var ITEMS = [
    { id: 'andesite_alloy',   name: 'Andesite Alloy' },
    { id: 'raw_zinc',         name: 'Raw Zinc' },
    { id: 'zinc_ingot',       name: 'Zinc Ingot' },
    { id: 'brass_ingot',      name: 'Brass Ingot' },
    { id: 'iron_sheet',       name: 'Iron Sheet' },
    { id: 'copper_sheet',     name: 'Copper Sheet' },
    { id: 'brass_sheet',      name: 'Brass Sheet' },
    { id: 'rose_quartz',      name: 'Rose Quartz' },
    { id: 'polished_rose_quartz', name: 'Polished Rose Quartz' },
    { id: 'electron_tube',    name: 'Electron Tube' },
    { id: 'integrated_circuit',name: 'Integrated Circuit' },
    { id: 'precision_mechanism', name: 'Precision Mechanism' },
    { id: 'super_glue',       name: 'Super Glue' },
    { id: 'wrench',           name: 'Wrench' },
    { id: 'filter',           name: 'Filter' },
    { id: 'attribute_filter', name: 'Attribute Filter' },
    { id: 'sand_paper',       name: 'Sand Paper' },
    { id: 'red_sand_paper',   name: 'Red Sand Paper' },
    { id: 'tree_fertilizer',  name: 'Tree Fertilizer' },
    { id: 'builders_tea',     name: "Builder's Tea" },
    { id: 'cogwheel_item',    name: 'Cogwheel', alias: true },
    { id: 'large_cogwheel_item', name: 'Large Cogwheel', alias: true },
    { id: 'shaft_item',       name: 'Shaft', alias: true }
  ];

  // ---- Export ----
  globalThis.CreateCatalog = { BLOCKS: BLOCKS, ITEMS: ITEMS };
})();

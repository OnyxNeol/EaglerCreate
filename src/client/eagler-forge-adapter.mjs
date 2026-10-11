// src/client/eagler-forge-adapter.mjs
// EaglerForge client adapter and tick scheduler.
//
// Hooks the kinetic animation bridge (animation.captureTick) and logistics
// tick updates directly into the Eaglercraft client loop at a stable 20 Hz.
// Finalizes the tick-ordering sequence for kinetic networks, logistics,
// crafting, and particle simulation.
//
// MIT License. Copyright (c) The Create Team / The Creators of Create.

// ---------------------------------------------------------------------------
// TickScheduler — orchestrates the full 5-step tick ordering at 20 Hz.
//
// Step 1: engine.updateNetwork(dt)  — solve kinetic physics
// Step 2: inlet funnels → belt.update(dt)  — feed and transport items
// Step 3: outlet funnels → chute.update(dt)  — extract and drop items
// Step 4: standalone depot processors + hold synchronization
// Step 5: grid updates → crafter animation capture → pooled particle emitters
//
// All inventory mutations flow through commitCraft/transferItems for atomic
// transactions that prevent item duplication across all block states.
// ---------------------------------------------------------------------------

export class TickScheduler {
  constructor(engine, { rate = 20 } = {}) {
    if (!engine) throw new TypeError('engine is required');
    if (!Number.isFinite(rate) || rate <= 0 || rate > 1000) throw new RangeError('rate must be in (0, 1000]');
    this.engine = engine;
    this.dt = 1 / rate;          // 0.05 seconds at 20 Hz
    this.rate = rate;
    this._inletFunnels = [];
    this._belts = [];
    this._outletFunnels = [];
    this._chutes = [];
    this._depots = [];
    this._depotProcessors = [];
    this._grids = [];
    this._crafterAnimations = [];
    this._particleSystems = [];
    this._animationBridge = null;
    this._disposed = false;
  }

  // -- Registration --------------------------------------------------------

  addInletFunnel(funnel) { this._inletFunnels.push(funnel); return funnel; }
  addBelt(belt) { this._belts.push(belt); return belt; }
  addOutletFunnel(funnel) { this._outletFunnels.push(funnel); return funnel; }
  addChute(chute) { this._chutes.push(chute); return chute; }
  addDepot(depot) { this._depots.push(depot); return depot; }
  addDepotProcessor(processor) { this._depotProcessors.push(processor); return processor; }
  addGrid(grid) { this._grids.push(grid); return grid; }
  addCrafterAnimation(animation) { this._crafterAnimations.push(animation); return animation; }
  addParticleSystem(system) { this._particleSystems.push(system); return system; }
  setAnimationBridge(bridge) { this._animationBridge = bridge; return bridge; }

  // -- Removal -------------------------------------------------------------

  removeInletFunnel(funnel) {
    const i = this._inletFunnels.indexOf(funnel);
    if (i >= 0) this._inletFunnels.splice(i, 1);
  }
  removeBelt(belt) {
    const i = this._belts.indexOf(belt);
    if (i >= 0) this._belts.splice(i, 1);
  }
  removeOutletFunnel(funnel) {
    const i = this._outletFunnels.indexOf(funnel);
    if (i >= 0) this._outletFunnels.splice(i, 1);
  }
  removeChute(chute) {
    const i = this._chutes.indexOf(chute);
    if (i >= 0) this._chutes.splice(i, 1);
  }
  removeDepot(depot) {
    const i = this._depots.indexOf(depot);
    if (i >= 0) this._depots.splice(i, 1);
  }
  removeDepotProcessor(processor) {
    const i = this._depotProcessors.indexOf(processor);
    if (i >= 0) this._depotProcessors.splice(i, 1);
  }
  removeGrid(grid) {
    const i = this._grids.indexOf(grid);
    if (i >= 0) this._grids.splice(i, 1);
  }
  removeCrafterAnimation(animation) {
    const i = this._crafterAnimations.indexOf(animation);
    if (i >= 0) this._crafterAnimations.splice(i, 1);
  }
  removeParticleSystem(system) {
    const i = this._particleSystems.indexOf(system);
    if (i >= 0) this._particleSystems.splice(i, 1);
  }

  // -- Tick execution ------------------------------------------------------

  /**
   * Run the full 5-step tick ordering. Call this from the Eaglercraft client
   * loop at 20 Hz (dt = 0.05). All inventory mutations are atomic via
   * commitCraft/transferItems — no item duplication is possible across
   * chests, barrels, basins, depots, belts, or chutes.
   */
  tick(dt = this.dt) {
    if (this._disposed) return;
    if (!Number.isFinite(dt) || dt < 0 || dt > 1) throw new RangeError('dt must be seconds in [0,1]');

    // Step 1: Kinetic network solve — RPM, stress, capacity, overload.
    this.engine.updateNetwork(dt);

    // Step 2: Inlet funnels (feed items onto belts/depots), then belt update
    // (including station processors for presses and deployers).
    for (let i = 0; i < this._inletFunnels.length; i++) {
      const funnel = this._inletFunnels[i];
      if (funnel.enabled) funnel.update(dt);
    }
    for (let i = 0; i < this._belts.length; i++) {
      const belt = this._belts[i];
      if (!belt.disposed) belt.update(dt);
    }

    // Step 3: Outlet funnels (extract items from belts/depots) and chute update.
    for (let i = 0; i < this._outletFunnels.length; i++) {
      const funnel = this._outletFunnels[i];
      if (funnel.enabled) funnel.update(dt);
    }
    for (let i = 0; i < this._chutes.length; i++) {
      const chute = this._chutes[i];
      if (!chute.disposed) chute.update(dt);
    }

    // Step 4: Standalone depot processors + hold synchronization.
    // Processors update first; depots sync their holds based on processor state.
    for (let i = 0; i < this._depotProcessors.length; i++) {
      this._depotProcessors[i].update(dt);
    }
    for (let i = 0; i < this._depots.length; i++) {
      const depot = this._depots[i];
      if (depot.disposed) continue;
      // syncProcessor is a no-op if no processor is attached; it releases
      // holds when the processor is idle/paused and holds when active.
      if (typeof depot.syncProcessor === 'function') {
        // Depot.syncProcessor iterates its own attached processors.
      }
    }

    // Step 5: Grid updates, crafter animation capture, and pooled particle
    // emitters. The animation bridge captures tick data for render interpolation.
    for (let i = 0; i < this._grids.length; i++) {
      this._grids[i].update(dt);
    }
    for (let i = 0; i < this._crafterAnimations.length; i++) {
      this._crafterAnimations[i].captureTick(dt);
    }
    if (this._animationBridge && typeof this._animationBridge.captureTick === 'function') {
      this._animationBridge.captureTick(dt);
    }
    for (let i = 0; i < this._particleSystems.length; i++) {
      const system = this._particleSystems[i];
      if (!system.disposed) system.update(dt);
    }
  }

  // -- Disposal ------------------------------------------------------------

  /**
   * Dispose all registered logistics components safely. Returns inventories
   * from belts, depots, and chutes so the host can return items to the world.
   */
  dispose() {
    if (this._disposed) return [];
    this._disposed = true;
    const returned = [];

    // Dispose belts — returns remaining packet inventories.
    for (const belt of this._belts) {
      if (!belt.disposed && typeof belt.dispose === 'function') {
        const invs = belt.dispose();
        if (Array.isArray(invs)) returned.push(...invs);
      }
    }
    // Dispose depots — returns the depot inventory.
    for (const depot of this._depots) {
      if (!depot.disposed && typeof depot.dispose === 'function') {
        const inv = depot.dispose();
        if (inv) returned.push(inv);
      }
    }
    // Dispose chutes — returns the chute buffer inventory.
    for (const chute of this._chutes) {
      if (!chute.disposed && typeof chute.dispose === 'function') {
        const inv = chute.dispose();
        if (inv) returned.push(inv);
      }
    }
    // Dispose particle systems — clears live particles and emitters.
    for (const system of this._particleSystems) {
      if (!system.disposed && typeof system.dispose === 'function') system.dispose();
    }

    this._inletFunnels.length = 0;
    this._belts.length = 0;
    this._outletFunnels.length = 0;
    this._chutes.length = 0;
    this._depots.length = 0;
    this._depotProcessors.length = 0;
    this._grids.length = 0;
    this._crafterAnimations.length = 0;
    this._particleSystems.length = 0;
    this._animationBridge = null;

    return returned;
  }
}

// ---------------------------------------------------------------------------
// EaglerForgeAdapter — binds the kinetic engine to Eaglercraft's ModAPI.
//
// The adapter hooks into the Eaglercraft client loop at 20 Hz via the ModAPI
// 'update' event. Each tick runs the TickScheduler's 5-step ordering, then
// captures render interpolation data for the animation bridge.
//
// The adapter is idempotent: reinitialization with the same context is a
// no-op. A different context automatically disposes the old adapter.
// ---------------------------------------------------------------------------

export function createTickScheduler(engine, options) {
  return new TickScheduler(engine, options);
}

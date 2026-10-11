// test/scene.js
// 3D scene setup: matrix math, kinetic network, renderer (WebGL with Canvas 2D fallback),
// animation bridge, and the render loop.

const EC = globalThis.EaglerCreate;
const Assets = globalThis.EaglerCreateAssets;

// ---------------------------------------------------------------------------
// Matrix math (column-major 4x4, WebGL convention)
// ---------------------------------------------------------------------------

function identity4() {
  const m = new Float32Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
}

function multiply4(a, b) {
  const out = new Float32Array(16);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      out[col * 4 + row] =
        a[row] * b[col * 4] +
        a[4 + row] * b[col * 4 + 1] +
        a[8 + row] * b[col * 4 + 2] +
        a[12 + row] * b[col * 4 + 3];
    }
  }
  return out;
}

function perspective(fovY, aspect, near, far) {
  const f = 1 / Math.tan(fovY / 2);
  const nf = 1 / (near - far);
  const m = new Float32Array(16);
  m[0] = f / aspect;
  m[5] = f;
  m[10] = (far + near) * nf;
  m[11] = -1;
  m[14] = 2 * far * near * nf;
  return m;
}

function lookAt(eye, target, up) {
  const zx = eye[0] - target[0], zy = eye[1] - target[1], zz = eye[2] - target[2];
  let zl = Math.hypot(zx, zy, zz);
  const zx2 = zx / zl, zy2 = zy / zl, zz2 = zz / zl;
  const xx = up[1] * zz2 - up[2] * zy2;
  const xy = up[2] * zx2 - up[0] * zz2;
  const xz = up[0] * zy2 - up[1] * zx2;
  let xl = Math.hypot(xx, xy, xz);
  const xx2 = xx / xl, xy2 = xy / xl, xz2 = xz / xl;
  const yx = zy2 * xz2 - zz2 * xy2;
  const yy = zz2 * xx2 - zx2 * xz2;
  const yz = zx2 * xy2 - zy2 * xx2;
  const m = new Float32Array(16);
  m[0] = xx2; m[1] = yx; m[2] = zx2; m[3] = 0;
  m[4] = xy2; m[5] = yy; m[6] = zy2; m[7] = 0;
  m[8] = xz2; m[9] = yz; m[10] = zz2; m[11] = 0;
  m[12] = -(xx2 * eye[0] + xy2 * eye[1] + xz2 * eye[2]);
  m[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
  m[14] = -(zx2 * eye[0] + zy2 * eye[1] + zz2 * eye[2]);
  m[15] = 1;
  return m;
}

// ---------------------------------------------------------------------------
// Scene setup
// ---------------------------------------------------------------------------

const engine = new EC.KineticEngine({ maxRPM: 256, maxDeltaSeconds: 0.25 });

// Register default Create kinetic block types.
const DEFAULT_BLOCKS = [
  { id: 'shaft', config: { kind: 'shaft' } },
  { id: 'cogwheel', config: { kind: 'cog', gearRadius: 1 } },
  { id: 'large_cogwheel', config: { kind: 'cog', gearRadius: 2 } },
  { id: 'water_wheel', config: { kind: 'source', isSource: true, sourceSpeed: 32, capacity: 8 } },
  { id: 'mechanical_press', config: { kind: 'consumer', stress: 8 } },
  { id: 'gearbox', config: { kind: 'gearbox', facing: { x: 0, y: 1, z: 0 } } },
];
for (const b of DEFAULT_BLOCKS) engine.registerKineticBlock(b.id, b.config);

// Place blocks in a kinetic network.
const waterWheel = engine.createKineticBlock('water_wheel', { x: 0, y: 0, z: 0 }, { facing: { x: 1, y: 0, z: 0 } });
const shaft1 = engine.createKineticBlock('shaft', { x: 1, y: 0, z: 0 }, { facing: { x: 1, y: 0, z: 0 } });
const cog1 = engine.createKineticBlock('cogwheel', { x: 2, y: 0, z: 0 }, { facing: { x: 1, y: 0, z: 0 } });
const largeCog = engine.createKineticBlock('large_cogwheel', { x: 2, y: 1, z: 0 }, { facing: { x: 1, y: 0, z: 0 } });
const shaft2 = engine.createKineticBlock('shaft', { x: 3, y: 0, z: 0 }, { facing: { x: 1, y: 0, z: 0 } });
const press = engine.createKineticBlock('mechanical_press', { x: 4, y: 0, z: 0 }, { facing: { x: 1, y: 0, z: 0 } });

// Connect the network: water wheel → shaft → cog → large cog (meshed) → shaft → press
engine.connectShafts(waterWheel, shaft1);
engine.connectShafts(shaft1, cog1);
engine.connectCogwheels(cog1, largeCog);
engine.connectShafts(cog1, shaft2);
engine.connectShafts(shaft2, press);

// All blocks to render.
const allBlocks = [waterWheel, shaft1, cog1, largeCog, shaft2, press];

// ---------------------------------------------------------------------------
// Renderer setup — try WebGL, fall back to Canvas 2D
// ---------------------------------------------------------------------------

let renderer = null;
let rendererType = 'none';
const canvas = document.getElementById('scene-canvas');

async function setupRenderer() {
  // Load textures from the embedded assets.
  const textures = await EC.loadModelTextures(Assets, { allowPlaceholders: true });

  // Build the model builder.
  const builder = new EC.ModelBuilder(Assets);

  // Try WebGL first.
  try {
    renderer = new EC.WebGLModelRenderer(canvas, textures);
    rendererType = 'webgl';
  } catch (e) {
    console.warn('WebGL unavailable, falling back to Canvas 2D:', e.message);
    renderer = new EC.CanvasModelRenderer(canvas, textures);
    rendererType = 'canvas2d';
  }

  // Set up the camera (perspective * lookAt).
  const aspect = canvas.width / canvas.height;
  const proj = perspective(Math.PI / 4, aspect, 0.1, 100);
  const view = lookAt([6, 5, 8], [2, 0.5, 0], [0, 1, 0]);
  renderer.camera = multiply4(proj, view);

  // Set up the animation bridge.
  const animationBridge = new EC.AnimationBridge({
    builder,
    registry: Assets.registry,
    draw: (mesh, matrix, record, part) => renderer.draw(mesh, matrix, record, part),
    beginFrame: () => renderer.beginFrame(),
    endFrame: () => renderer.endFrame(),
  });

  // Attach all blocks to the animation bridge.
  for (const block of allBlocks) {
    animationBridge.attach(block);
  }

  document.getElementById('renderer-mode').textContent =
    rendererType === 'webgl' ? 'WebGL Renderer' : 'Canvas 2D Fallback';

  return { renderer, animationBridge, builder, textures };
}

// ---------------------------------------------------------------------------
// Kinetic diagram (2D top-down view)
// ---------------------------------------------------------------------------

function setupKineticDiagram() {
  const kcanvas = document.getElementById('kinetic-canvas');
  const kctx = kcanvas.getContext('2d');
  const project = (pos, out) => {
    out.x = 80 + pos.x * 120;
    out.y = kcanvas.height / 2 + pos.y * 30;
  };
  return EC.createCanvasKineticRenderer(kctx, project);
}

// ---------------------------------------------------------------------------
// Animation loop
// ---------------------------------------------------------------------------

let animationBridge = null;
let kineticRenderer = null;
let lastTime = performance.now();

function startAnimationLoop(bridge) {
  animationBridge = bridge;
  kineticRenderer = setupKineticDiagram();

  function frame(now) {
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;

    // Tick the engine.
    engine.updateNetwork(dt);

    // Capture tick for animation.
    animationBridge.captureTick(dt);

    // Render the 3D scene.
    animationBridge.render(1);

    // Render the kinetic diagram.
    kineticRenderer.beginFrame();
    for (const block of allBlocks) {
      kineticRenderer.setRotation(block, block.angle);
    }

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

// Expose to globalThis for non-module scripts
globalThis.EaglerCreateScene = { engine, Assets, setupRenderer, startAnimationLoop, allBlocks };

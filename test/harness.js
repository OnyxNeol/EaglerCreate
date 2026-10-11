// test/harness.js
// Main test harness: Pyodide loading, UI wiring, Python code execution, tests.

// Access scene and bridge from globalThis (loaded via regular script tags)
const { engine, Assets, setupRenderer, startAnimationLoop, allBlocks } = globalThis.EaglerCreateScene;
const PythonBridge = globalThis.PythonBridge;

// ---------------------------------------------------------------------------
// UI elements
// ---------------------------------------------------------------------------

const pyStatus = document.getElementById('py-status');
const btnLoadPy = document.getElementById('btn-load-py');
const btnRun = document.getElementById('btn-run');
const btnTests = document.getElementById('btn-tests');
const codeArea = document.getElementById('python-code');
const consoleEl = document.getElementById('console-output');
const blocksList = document.getElementById('blocks-list');
const blockCount = document.getElementById('block-count');
const testResults = document.getElementById('test-results');

// ---------------------------------------------------------------------------
// Console output
// ---------------------------------------------------------------------------

function log(msg, cls = 'info') {
  const line = document.createElement('div');
  line.className = `console-line ${cls}`;
  line.textContent = msg;
  consoleEl.appendChild(line);
  consoleEl.scrollTop = consoleEl.scrollHeight;
}

// ---------------------------------------------------------------------------
// Default Python mod code
// ---------------------------------------------------------------------------

const DEFAULT_CODE = `# EaglerForge Python Mod Example
# Define custom blocks using the Tkinter-style declarative API.

from eaglerforge import createblock, MyCustomBlock

# --- Inline helper function syntax ---
# Single texture applied to all faces, rarity 5
def on_press():
    print("Mechanical press activated!")

press_block = createblock(
    texture="create:block/mechanical_press_top",
    command=on_press,
    rarity=5,
)
print(f"Registered block: {press_block}")

# --- Multi-face texture tuple syntax ---
# 6-tuple: (top, bottom, front, back, left, right)
def on_gear_tick(dt):
    pass  # callback runs every tick

gear_block = createblock(
    texture=("create:block/cogwheel", "create:block/axis_top",
             "create:block/cogwheel", "create:block/cogwheel",
             "create:block/cogwheel", "create:block/cogwheel"),
    command=on_gear_tick,
    rarity=12,
)
print(f"Registered block: {gear_block}")

# --- Class-based custom block structure ---
class SteamEngine(MyCustomBlock):
    def __init__(self):
        super().__init__(
            texture="create:block/brass_casing",
            function=self.activate,
            rarity=20,
        )

    def activate(self):
        print("Steam engine activated!")

engine = SteamEngine()
print(f"Registered block: {engine.block_id}")

# --- High rarity (no hardcoded cap) ---
super_rare = createblock(
    texture="create:block/andesite_casing",
    command=lambda: None,
    rarity=999999,
)
print(f"Registered block: {super_rare} (rarity: 999999)")

print("\\nAll blocks registered successfully!")
`;

codeArea.value = DEFAULT_CODE;

// ---------------------------------------------------------------------------
// Block list rendering
// ---------------------------------------------------------------------------

function renderBlockList(pythonBridge) {
  const blocks = pythonBridge ? pythonBridge.registeredBlocks : new Map();
  blocksList.innerHTML = '';

  // Engine blocks (built-in)
  for (const block of allBlocks) {
    const div = document.createElement('div');
    div.className = 'block-entry';
    div.innerHTML = `<span class="bid">${block.id}</span> <span class="bmeta">kind=${block.kind} pos=${block.position.x},${block.position.y},${block.position.z} rpm=${block.speed.toFixed(1)}</span>`;
    blocksList.appendChild(div);
  }

  // Python blocks
  for (const [id, def] of blocks) {
    const div = document.createElement('div');
    div.className = 'block-entry';
    div.innerHTML = `<span class="bid">${id}</span> <span class="bmeta">rarity=${def.rarity} kind=${def.kind}</span>`;
    blocksList.appendChild(div);
  }

  blockCount.textContent = allBlocks.length + (pythonBridge ? pythonBridge.blockCount : 0);
}

// ---------------------------------------------------------------------------
// Python bridge
// ---------------------------------------------------------------------------

let pythonBridge = null;

btnLoadPy.addEventListener('click', async () => {
  btnLoadPy.disabled = true;
  pyStatus.textContent = 'Pyodide: Loading…';
  pyStatus.className = 'badge loading';

  try {
    pythonBridge = new PythonBridge(engine, Assets, {
      onLog: (msg) => log(msg, 'info'),
      onError: (msg) => log(msg, 'error'),
    });
    await pythonBridge.load();

    pyStatus.textContent = 'Pyodide: Ready';
    pyStatus.className = 'badge';
    btnRun.disabled = false;
    btnTests.disabled = false;

    log('Pyodide runtime loaded successfully.', 'success');
    renderBlockList(pythonBridge);
  } catch (error) {
    pyStatus.textContent = 'Pyodide: Failed';
    pyStatus.className = 'badge offline';
    btnLoadPy.disabled = false;
    log(`Failed to load Pyodide: ${error.message}`, 'error');
    log('The 3D scene and kinetic engine still work — only Python features are unavailable.', 'dim');
  }
});

btnRun.addEventListener('click', async () => {
  if (!pythonBridge) return;
  const code = codeArea.value;
  log('Running Python code…', 'dim');
  try {
    await pythonBridge.runPythonAsync(code);
    log('Python code executed successfully.', 'success');
    renderBlockList(pythonBridge);
  } catch (error) {
    log(`Python execution failed: ${error.message}`, 'error');
  }
});

btnTests.addEventListener('click', async () => {
  if (!pythonBridge) return;
  log('Running unit tests…', 'dim');
  testResults.innerHTML = '';
  try {
    const results = await pythonBridge.runPythonFile('/test/tests/test_blocks.py');
    const testList = results.toJs ? results.toJs() : results;
    if (results.destroy) results.destroy();

    let passed = 0;
    let total = 0;
    for (const entry of testList) {
      total++;
      if (entry.passed) passed++;
      const div = document.createElement('div');
      div.className = 'test-entry';
      const status = entry.passed ? '✓ PASS' : '✗ FAIL';
      const statusClass = entry.passed ? 'pass' : 'fail';
      div.innerHTML = `<span class="${statusClass}">${status}</span> <span class="name">${entry.name}</span>`;
      if (entry.error) {
        div.innerHTML += ` <span class="fail">${entry.error}</span>`;
      }
      testResults.appendChild(div);
    }

    const summary = document.createElement('div');
    summary.className = 'test-summary';
    summary.innerHTML = `<span class="${passed === total ? 'pass' : 'fail'}">${passed}/${total} tests passed</span>`;
    testResults.appendChild(summary);

    log(`Tests complete: ${passed}/${total} passed`, passed === total ? 'success' : 'error');
  } catch (error) {
    log(`Test execution failed: ${error.message}`, 'error');
  }
});

// ---------------------------------------------------------------------------
// Initialize the 3D scene
// ---------------------------------------------------------------------------

(async () => {
  log('Initializing EaglerCreate kinetic engine…', 'dim');
  log(`Engine: ${allBlocks.length} blocks placed, ${engine.networks.length} network(s)`, 'info');

  try {
    const { animationBridge } = await setupRenderer();
    startAnimationLoop(animationBridge);
    log('3D scene initialized.', 'success');
  } catch (error) {
    log(`Scene initialization error: ${error.message}`, 'error');
  }

  renderBlockList(null);

  // Auto-load Pyodide after a short delay.
  setTimeout(() => {
    if (!pythonBridge) btnLoadPy.click();
  }, 800);
})();

// Update block list periodically to show live RPM.
setInterval(() => {
  if (pythonBridge !== null || allBlocks.length > 0) {
    renderBlockList(pythonBridge);
  }
}, 2000);

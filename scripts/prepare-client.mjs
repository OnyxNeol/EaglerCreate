// Keep embedded HTML strings in the offline client out of HTML proxy rewriting.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Script } from 'node:vm';

const root = new URL('../', import.meta.url);
const output = new URL('.base44/client/', root);
mkdirSync(output, { recursive: true });
const source = readFileSync(new URL('eaglercraft-injected.html', root), 'utf8');
let count = 0;
const html = source.replace(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi, (tag, attributes, code) => {
  if (/\bsrc\s*=/i.test(attributes) || !code.trim()) return tag;
  if (attributes.includes('id="modapi_guikit"')) {
    // Do not let Done dismiss the launcher before its asynchronous mod list
    // and launch callback are ready. Click also supports keyboard activation.
    code = code.replace(
      '<button class="button _doneButton" onclick="this.parentElement.parentElement.remove();">Done</button>',
      '<button class="button _doneButton" disabled>Done</button>'
    );
    code = code.replace(
      '    if (cb) {\n      document.querySelector("#modapi_gui_container ._doneButton").addEventListener("mousedown", ()=>{',
      '    const doneButton = document.querySelector("#modapi_gui_container ._doneButton");\n    doneButton.disabled = false;\n    {\n      doneButton.addEventListener("click", ()=>{'
    );
    code = code.replace('        cb();', '        if (cb) cb();');
  }
  const name = `script-${count++}.js`;
  // Fail before serving a broken generated client.
  new Script(code, { filename: name });
  writeFileSync(new URL(name, output), code);
  return `<script${attributes} src="/.base44/client/${name}"></script>`;
});
// Copy the Create catalog and block registration scripts into the externalized client dir.
const createCatalogSrc = readFileSync(new URL('src/client/create-catalog.js', root), 'utf8');
new Script(createCatalogSrc, { filename: 'create-catalog.js' });
writeFileSync(new URL('create-catalog.js', output), createCatalogSrc);

const createBlocksSrc = readFileSync(new URL('src/client/create-blocks.js', root), 'utf8');
new Script(createBlocksSrc, { filename: 'create-blocks.js' });
writeFileSync(new URL('create-blocks.js', output), createBlocksSrc);

// Inject the catalog and block registration scripts after the EaglerCreate injector bundle.
const finalHtml = html.replace(
  '<script src="/dist/eagler-create.js"></script>',
  '<script src="/dist/eagler-create.js"></script>\n<script src="/.base44/client/create-catalog.js"></script>\n<script src="/.base44/client/create-blocks.js"></script>'
);

writeFileSync(new URL('index.html', output), finalHtml);
console.log(`Prepared ${count} client scripts + create-blocks.js in ${fileURLToPath(output)}`);

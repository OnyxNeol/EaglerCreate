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
  const name = `script-${count++}.js`;
  // Fail before serving a broken generated client.
  new Script(code, { filename: name });
  writeFileSync(new URL(name, output), code);
  return `<script${attributes} src="/.base44/client/${name}"></script>`;
});
writeFileSync(new URL('index.html', output), html);
console.log(`Prepared ${count} client scripts in ${fileURLToPath(output)}`);

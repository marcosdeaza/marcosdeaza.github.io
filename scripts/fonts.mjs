// Descarga las fuentes de Google Fonts a src/fonts y escribe src/fonts.css.
// Se ejecuta una vez; el resultado se versiona para no depender del CDN.
import { writeFile, mkdir } from 'node:fs/promises';

const FAMILIES = 'family=Castoro:ital@0;1&family=Castoro+Titling&family=Michroma&family=B612+Mono';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
const KEEP = new Set(['latin', 'latin-ext']);

const css = await (await fetch(`https://fonts.googleapis.com/css2?${FAMILIES}&display=swap`, { headers: { 'User-Agent': UA } })).text();
await mkdir('src/fonts', { recursive: true });

const out = [];
for (const block of css.split(/(?=\/\* )/)) {
  const subset = block.match(/^\/\* ([\w-]+) \*\//)?.[1];
  if (!subset || !KEEP.has(subset)) continue;
  const family = block.match(/font-family: '([^']+)'/)[1];
  const style = block.match(/font-style: (\w+)/)[1];
  const url = block.match(/url\(([^)]+)\)/)[1];
  const file = `${family.toLowerCase().replace(/\s+/g, '-')}-${style}-${subset}.woff2`;
  await writeFile(`src/fonts/${file}`, Buffer.from(await (await fetch(url)).arrayBuffer()));
  out.push(block.replace(url, `fonts/${file}`).trim());
}
await writeFile('src/fonts.css', out.join('\n') + '\n');
console.log(`${out.length} archivos de fuente`);

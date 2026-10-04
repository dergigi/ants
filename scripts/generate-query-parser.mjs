import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, readdir, unlink } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const version = '4.13.2';
const dir = `${root}.cache/antlr`;
await mkdir(dir, { recursive: true });
const jar = `${dir}/antlr-${version}-complete.jar`;
let bytes;
try { bytes = await readFile(jar); } catch {
  const response = await fetch(`https://www.antlr.org/download/antlr-${version}-complete.jar`);
  if (!response.ok) throw new Error(`ANTLR download failed: ${response.status}`);
  bytes = Buffer.from(await response.arrayBuffer());
}
const expected = 'eae2dfa119a64327444672aff63e9ec35a20180dc5b8090b7a6ab85125df4d76';
if (createHash('sha256').update(bytes).digest('hex') !== expected) throw new Error('ANTLR jar checksum mismatch');
await writeFile(jar, bytes);
const output = `${root}src/lib/search/query/generated`;
await mkdir(output, { recursive: true });
const result = spawnSync('java', ['-jar', jar, '-Dlanguage=TypeScript', '-no-listener', '-Xexact-output-dir', '-o', output, 'grammar/AntsQuery.g4'], { cwd: root, stdio: 'inherit' });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
for (const file of await readdir(output)) {
  if (!file.endsWith('.ts')) await unlink(`${output}/${file}`);
  else {
    const source = await readFile(`${output}/${file}`, 'utf8');
    await writeFile(`${output}/${file}`, source.replace(/^[ \t]+/gm, indent => indent.replace(/\t/g, '    ')).replace(/[ \t]+$/gm, ''));
  }
}

// Compiles the Java runtime library (rt/) into public/rt.jar.
// The library replaces java.lang itself, so javac must not see the host JDK's classes:
// -source/-target 8 with a -bootclasspath pointing at our own output.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'rt');
const out = path.join(root, 'build', 'rt');
const jarPath = path.join(root, 'public', 'rt.jar');

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (e.name.endsWith('.java')) acc.push(p);
  }
  return acc;
}

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
fs.mkdirSync(path.dirname(jarPath), { recursive: true });

const sources = walk(src);
const argfile = path.join(root, 'build', 'rt-sources.txt');
fs.writeFileSync(argfile, sources.map((s) => `"${s.replace(/\\/g, '/')}"`).join('\n'));

try {
  execFileSync('javac', [
    '-source', '8', '-target', '8', '-Xlint:-options', '-nowarn', '-encoding', 'UTF-8',
    '-g:source,lines',
    '-bootclasspath', out, '-sourcepath', src, '-d', out, `@${argfile}`,
  ], { stdio: 'inherit' });
} catch {
  process.exit(1);
}

fs.rmSync(jarPath, { force: true });
execFileSync('jar', ['cf', jarPath, '-C', out, '.'], { stdio: 'inherit' });
console.log(`rt.jar: ${sources.length} sources -> ${path.relative(root, jarPath)} (${fs.statSync(jarPath).size} bytes)`);

// Example MIDlets (examples/<name>/*.java + MANIFEST.MF) -> public/<name>.jar
const examples = path.join(root, 'examples');
for (const name of fs.existsSync(examples) ? fs.readdirSync(examples) : []) {
  const dir = path.join(examples, name);
  if (!fs.statSync(dir).isDirectory()) continue;
  const classes = path.join(root, 'build', 'examples', name);
  fs.rmSync(classes, { recursive: true, force: true });
  fs.mkdirSync(classes, { recursive: true });
  const srcs = fs.readdirSync(dir).filter((f) => f.endsWith('.java')).map((f) => path.join(dir, f));
  try {
    execFileSync('javac', ['-source', '8', '-target', '8', '-Xlint:-options', '-nowarn', '-encoding', 'UTF-8',
      '-g:source,lines', '-bootclasspath', out, '-d', classes, ...srcs], { stdio: 'inherit' });
  } catch {
    process.exit(1);
  }
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.java') && f !== 'MANIFEST.MF') fs.copyFileSync(path.join(dir, f), path.join(classes, f));
  }
  const exJar = path.join(root, 'public', `${name}.jar`);
  fs.rmSync(exJar, { force: true });
  execFileSync('jar', ['cfm', exJar, path.join(dir, 'MANIFEST.MF'), '-C', classes, '.'], { stdio: 'inherit' });
  console.log(`example: ${name} -> ${path.relative(root, exJar)}`);
}

// Builds the test programs:
//  - test/java/*.java   -> compiled against rt (for our VM) and against the host JDK, which is run
//                          to produce the expected output (test/out/expected/<Name>.txt)
//  - test/midlets/<name>/ -> compiled against rt and packaged as test/out/<name>.jar (MIDlet suites)
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rt = path.join(root, 'build', 'rt');
const outDir = path.join(root, 'test', 'out');
const javacRt = ['-source', '8', '-target', '8', '-Xlint:-options', '-nowarn', '-encoding', 'UTF-8', '-g:source,lines', '-bootclasspath', rt];

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(path.join(outDir, 'vm'), { recursive: true });
fs.mkdirSync(path.join(outDir, 'host'), { recursive: true });
fs.mkdirSync(path.join(outDir, 'expected'), { recursive: true });

const coreDir = path.join(root, 'test', 'java');
const core = fs.readdirSync(coreDir).filter((f) => f.endsWith('.java')).map((f) => path.join(coreDir, f));
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'inherit'], ...opts });

run('javac', [...javacRt, '-d', path.join(outDir, 'vm'), ...core]);
run('javac', ['-nowarn', '-encoding', 'UTF-8', '-d', path.join(outDir, 'host'), ...core]);
for (const f of core) {
  const name = path.basename(f, '.java');
  const out = run('java', ['-Dfile.encoding=UTF-8', '-Dstdout.encoding=UTF-8', '-cp', path.join(outDir, 'host'), name]);
  fs.writeFileSync(path.join(outDir, 'expected', name + '.txt'), out);
}

// test images written by the JDK's PNG encoder
const pngDir = path.join(outDir, 'png');
run('java', [path.join(root, 'scripts', 'GenPng.java'), pngDir]);

const midletsDir = path.join(root, 'test', 'midlets');
if (fs.existsSync(midletsDir)) {
  for (const name of fs.readdirSync(midletsDir)) {
    const dir = path.join(midletsDir, name);
    if (!fs.statSync(dir).isDirectory()) continue;
    const classes = path.join(outDir, 'midlets', name);
    fs.mkdirSync(classes, { recursive: true });
    const sources = fs.readdirSync(dir).filter((f) => f.endsWith('.java')).map((f) => path.join(dir, f));
    run('javac', [...javacRt, '-d', classes, ...sources]);
    // copy resources (anything that is not .java / MANIFEST.MF)
    for (const f of fs.readdirSync(dir)) {
      if (f.endsWith('.java') || f === 'MANIFEST.MF') continue;
      fs.copyFileSync(path.join(dir, f), path.join(classes, f));
    }
    for (const f of fs.readdirSync(pngDir)) fs.copyFileSync(path.join(pngDir, f), path.join(classes, f));
    const jar = path.join(outDir, name + '.jar');
    run('jar', ['cfm', jar, path.join(dir, 'MANIFEST.MF'), '-C', classes, '.']);
  }
}
console.log('tests built');

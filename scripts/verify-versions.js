import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// 1. Read root package.json
const rootPkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
const expectedVersion = rootPkg.version;

// 2. Read CLI package.json
const cliPkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'cli', 'package.json'), 'utf8'));

// 3. Read UI package.json
const uiPkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'ui', 'package.json'), 'utf8'));

// 4. Read Go server ServerVersion constant in server/main.go
const mainGoContent = fs.readFileSync(path.join(rootDir, 'server', 'main.go'), 'utf8');
const goVersionMatch = mainGoContent.match(/ServerVersion\s*=\s*"([^"]+)"/);
const goVersion = goVersionMatch ? goVersionMatch[1] : null;

const targets = [
  { name: 'Root package.json', version: rootPkg.version, file: 'package.json' },
  { name: 'CLI package.json', version: cliPkg.version, file: 'cli/package.json' },
  { name: 'UI package.json', version: uiPkg.version, file: 'ui/package.json' },
  { name: 'Go server/main.go', version: goVersion, file: 'server/main.go' },
];

let hasMismatch = false;

console.log(`🔍 Checking repository version synchronization (Target: v${expectedVersion})...\n`);

for (const target of targets) {
  const isMatch = target.version === expectedVersion;
  const status = isMatch ? '\x1b[32m✔ MATCH\x1b[0m' : '\x1b[31m✖ MISMATCH\x1b[0m';
  console.log(`  [${status}] ${target.name.padEnd(22)}: ${target.version || 'NOT FOUND'} (${target.file})`);
  if (!isMatch) {
    hasMismatch = true;
  }
}

if (hasMismatch) {
  console.error(`\n\x1b[31m✖ Version sync failed!\x1b[0m All components must share the identical version (v${expectedVersion}).`);
  process.exit(1);
}

console.log(`\n\x1b[32m✔ All components are synchronized on v${expectedVersion}!\x1b[0m`);
process.exit(0);

import { createRequire } from 'module';

const req = createRequire(import.meta.url);

const nodeVer = process.versions.node;
const major = parseInt(nodeVer.split('.')[0], 10);
const minor = parseInt(nodeVer.split('.')[1], 10);

if (major < 22 || (major === 22 && minor < 12)) {
  console.error(`[ERROR] Build rejected. Node version must be >= 22.12.0. Current version is ${nodeVer}.`);
  process.exit(1);
}

try {
  req('@tailwindcss/oxide');
  console.log(`[OK] Node version ${nodeVer} is verified and @tailwindcss/oxide is available.`);
} catch (err) {
  console.error(`[ERROR] Cannot find native binding for @tailwindcss/oxide.`);
  console.error(`Please run 'npm ci --include=optional' on a Node >= 22.12.0 system to download the correct native binary.`);
  process.exit(1);
}

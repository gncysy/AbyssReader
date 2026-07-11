// scripts/copy-preload.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const srcPreload = path.join(__dirname, '../src/main/preload.cjs');
const destDir = path.join(__dirname, '../dist/main');
const destPreload = path.join(destDir, 'preload.cjs');

try {
  fs.mkdirSync(destDir, { recursive: true });
  fs.copyFileSync(srcPreload, destPreload);
  console.log('✓ preload.cjs copied');
} catch (err) {
  console.error('✗ Failed to copy preload.cjs:', err.message);
  process.exit(1);
}

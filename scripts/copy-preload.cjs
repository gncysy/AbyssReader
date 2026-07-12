const fs = require('fs');
const path = require('path');

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

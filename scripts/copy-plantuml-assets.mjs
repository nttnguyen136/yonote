import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageDirectory = resolve(root, 'node_modules/@plantuml/core');
const targetDirectory = resolve(root, 'public/plantuml');

await mkdir(targetDirectory, { recursive: true });
await Promise.all([
  copyFile(resolve(packageDirectory, 'plantuml.js'), resolve(targetDirectory, 'plantuml.js')),
  copyFile(resolve(packageDirectory, 'viz-global.js'), resolve(targetDirectory, 'viz-global.js')),
]);
console.log(`Copied PlantUML browser assets to ${targetDirectory}`);

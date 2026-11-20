// Runs Vitest from the project's true path. Windows shells can report the drive in lowercase (c:\...):
// Vitest then starts its workers from that spelling but resolves test files to C:\..., loads two copies of
// its runner and fails every file with "Cannot read properties of undefined (reading 'config')".
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = realpathSync.native(path.resolve(import.meta.dirname, '..'));
process.chdir(root);
await import(pathToFileURL(realpathSync.native(path.join(root, 'node_modules', 'vitest', 'vitest.mjs'))).href);

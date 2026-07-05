// SPDX-License-Identifier: AGPL-3.0-or-later
// Stage the built reference dist into the Tauri frontendDist (web/dist).
//
// Runs after rspack + tauri-postbuild. Copies fluxer_app/dist -> web/dist so
// the existing Tauri config (frontendDist: "../web/dist") serves the reference
// client unchanged.

import {cpSync, rmSync, existsSync, mkdirSync} from 'node:fs';
import path, {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, '..', 'dist');
// fluxer_app -> reference/fluxer/fluxer_app ; project root is 4 levels up.
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const DEST = path.join(PROJECT_ROOT, 'web', 'dist');

if (!existsSync(SRC)) {
	console.error(`[tauri-stage] missing build output: ${SRC}`);
	process.exit(1);
}
if (existsSync(DEST)) rmSync(DEST, {recursive: true, force: true});
mkdirSync(DEST, {recursive: true});
cpSync(SRC, DEST, {recursive: true});
console.log(`[tauri-stage] copied ${SRC} -> ${DEST}`);

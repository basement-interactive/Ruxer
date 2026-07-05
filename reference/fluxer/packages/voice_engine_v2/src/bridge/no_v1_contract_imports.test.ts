// SPDX-License-Identifier: AGPL-3.0-or-later
/// <reference types="node" />

import {readdirSync, readFileSync, statSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../../..');
const BLOCKED_IMPORT = '@fluxer/' + 'voice_' + 'engine_contract';
const BLOCKED_PATH = 'voice_' + 'engine_contract';
const BLOCKED_MARKERS = [
	BLOCKED_IMPORT,
	BLOCKED_PATH,
	'Voice' + 'EngineApi',
	'VOICE_ENGINE_' + 'CONTRACT_VERSION',
	'contract' + 'Version',
];
const SCAN_TARGETS = ['fluxer_app', 'fluxer_desktop', 'packages', 'pnpm-lock.yaml', 'pnpm-workspace.yaml'];
const TEXT_EXTENSIONS = new Set([
	'.cjs',
	'.cts',
	'.js',
	'.json',
	'.jsx',
	'.mjs',
	'.mts',
	'.rs',
	'.ts',
	'.tsx',
	'.toml',
	'.yaml',
	'.yml',
]);
const SKIPPED_DIRECTORIES = new Set(['.git', 'coverage', 'dist', 'node_modules', 'target', 'vendor']);

function shouldScanFile(filePath: string): boolean {
	if (path.basename(filePath) === 'package.json') return true;
	return TEXT_EXTENSIONS.has(path.extname(filePath));
}

function collectFiles(targetPath: string, files: Array<string> = []): Array<string> {
	const stat = statSync(targetPath);
	if (stat.isFile()) {
		if (shouldScanFile(targetPath)) files.push(targetPath);
		return files;
	}
	if (!stat.isDirectory()) return files;
	if (SKIPPED_DIRECTORIES.has(path.basename(targetPath))) return files;
	for (const entry of readdirSync(targetPath)) {
		collectFiles(path.join(targetPath, entry), files);
	}
	return files;
}

describe('voice engine v2 package boundary', () => {
	it('does not reintroduce the deleted v1 voice engine contract', () => {
		const matches = SCAN_TARGETS.flatMap((target) => collectFiles(path.join(REPO_ROOT, target))).flatMap((filePath) => {
			const source = readFileSync(filePath, 'utf8');
			const blockedMarker = BLOCKED_MARKERS.find((marker) => source.includes(marker));
			if (!blockedMarker) return [];
			return [`${path.relative(REPO_ROOT, filePath)} -> ${blockedMarker}`];
		});

		expect(matches).toEqual([]);
	});
});

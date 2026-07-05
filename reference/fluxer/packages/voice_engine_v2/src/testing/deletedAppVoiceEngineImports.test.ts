// SPDX-License-Identifier: AGPL-3.0-or-later
/// <reference types="node" />

import {readdirSync, readFileSync, statSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../../..');
const APP_SOURCE_ROOT = path.join(REPO_ROOT, 'fluxer_app/src');
const APP_ALIAS_PREFIX = '@app/';
const APP_ALIAS_ROOT = path.join(REPO_ROOT, 'fluxer_app/src');
const SCAN_TARGETS = ['fluxer_app/src'];
const DELETED_APP_VOICE_ENGINE_MODULE_BASENAMES = [
	'Audio',
	'Connection',
	'DebugLogging',
	'EntranceSound',
	'Media',
	'MediaStateCoordinator',
	'Participant',
	'Permission',
	'RemoteSpeakingLevel',
	'ScreenShare',
	'State',
	'StateSync',
	'Stats',
	'Subscription',
];
const APP_VOICE_ENGINE_MODULE_PREFIX = 'fluxer_app/src/features/voice/engine/Voice';
const APP_VOICE_ENGINE_DELETED_MODULE_SUFFIX = 'Manager';

const DELETED_APP_VOICE_ENGINE_MODULES = new Set(
	DELETED_APP_VOICE_ENGINE_MODULE_BASENAMES.map(
		(basename) => `${APP_VOICE_ENGINE_MODULE_PREFIX}${basename}${APP_VOICE_ENGINE_DELETED_MODULE_SUFFIX}`,
	),
);

const DELETED_APP_VOICE_ENGINE_IMPORT_ALLOWLIST: Array<string> = [];

const IMPORT_FROM_PATTERN = /\b(?:import|export)\s+(?:type\s+)?[^'";]*?\sfrom\s*['"]([^'"]+)['"]/g;
const SIDE_EFFECT_IMPORT_PATTERN = /\bimport\s*['"]([^'"]+)['"]/g;
const DYNAMIC_IMPORT_PATTERN = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);
const SKIPPED_DIRECTORIES = new Set(['.git', 'coverage', 'dist', 'node_modules']);

function toRepoPath(filePath: string): string {
	return path.relative(REPO_ROOT, filePath).split(path.sep).join('/');
}

function withoutSourceExtension(filePath: string): string {
	return filePath.replace(/\.(?:c|m)?tsx?$/, '');
}

function shouldScanFile(filePath: string): boolean {
	const basename = path.basename(filePath);
	if (basename.endsWith('.d.ts')) return false;
	if (basename.endsWith('.bench.ts')) return false;
	if (/\.(?:test|spec)\.tsx?$/.test(basename)) return false;
	return SOURCE_EXTENSIONS.has(path.extname(filePath));
}

function collectFiles(targetPath: string, files: Array<string> = []): Array<string> {
	const stat = statSync(targetPath);
	if (stat.isFile()) {
		if (shouldScanFile(targetPath)) files.push(targetPath);
		return files;
	}
	if (!stat.isDirectory()) return files;
	if (SKIPPED_DIRECTORIES.has(path.basename(targetPath))) return files;
	for (const entry of readdirSync(targetPath).sort()) {
		collectFiles(path.join(targetPath, entry), files);
	}
	return files;
}

function collectImportSpecifiers(source: string): Array<string> {
	const specifiers = new Set<string>();
	for (const pattern of [IMPORT_FROM_PATTERN, SIDE_EFFECT_IMPORT_PATTERN, DYNAMIC_IMPORT_PATTERN]) {
		pattern.lastIndex = 0;
		let match = pattern.exec(source);
		while (match) {
			specifiers.add(match[1]);
			match = pattern.exec(source);
		}
	}
	return [...specifiers];
}

function resolveImportTarget(sourceFile: string, specifier: string): string | null {
	if (specifier.startsWith(APP_ALIAS_PREFIX)) {
		const aliasedPath = path.join(APP_ALIAS_ROOT, specifier.slice(APP_ALIAS_PREFIX.length));
		return toRepoPath(withoutSourceExtension(aliasedPath));
	}

	if (specifier.startsWith('.')) {
		const relativePath = path.resolve(path.dirname(sourceFile), specifier);
		if (!relativePath.startsWith(APP_SOURCE_ROOT)) return null;
		return toRepoPath(withoutSourceExtension(relativePath));
	}

	return null;
}

function collectDeletedAppVoiceEngineImports(): Array<string> {
	const imports = new Set<string>();
	for (const target of SCAN_TARGETS) {
		for (const filePath of collectFiles(path.join(REPO_ROOT, target))) {
			const source = readFileSync(filePath, 'utf8');
			for (const specifier of collectImportSpecifiers(source)) {
				const resolvedTarget = resolveImportTarget(filePath, specifier);
				if (!resolvedTarget || !DELETED_APP_VOICE_ENGINE_MODULES.has(resolvedTarget)) continue;
				imports.add(`${toRepoPath(filePath)} -> ${resolvedTarget}`);
			}
		}
	}
	return [...imports].sort();
}

describe('deleted app voice engine import guard', () => {
	it('blocks production imports from deleted app-owned voice engine modules', () => {
		const actualImports = collectDeletedAppVoiceEngineImports();

		expect(actualImports).toHaveLength(DELETED_APP_VOICE_ENGINE_IMPORT_ALLOWLIST.length);
		expect(actualImports).toEqual(DELETED_APP_VOICE_ENGINE_IMPORT_ALLOWLIST);
	});
});

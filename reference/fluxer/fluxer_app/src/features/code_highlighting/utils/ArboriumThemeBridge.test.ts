// SPDX-License-Identifier: AGPL-3.0-or-later

import {readdirSync, readFileSync, statSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';

const require = createRequire(import.meta.url);
const bridgeCss = readFileSync(new URL('./ArboriumThemeBridge.css', import.meta.url), 'utf8');
const highlightingSource = readFileSync(new URL('./ArboriumHighlighting.ts', import.meta.url), 'utf8');
const upstreamBaseCss = readFileSync(require.resolve('@arborium/arborium/themes/base.css'), 'utf8');

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getRuleBody(selector: string): string {
	const match = new RegExp(`(?:^|\\n)${escapeRegExp(selector)} \\{\\n([\\s\\S]*?)\\n\\}`, 'u').exec(bridgeCss);
	expect(match).not.toBeNull();
	return match?.[1] ?? '';
}

function listCssFiles(directory: URL): Array<string> {
	const absoluteDirectory = fileURLToPath(directory);
	const files: Array<string> = [];
	for (const entry of readdirSync(absoluteDirectory)) {
		const absoluteEntry = `${absoluteDirectory}/${entry}`;
		const stat = statSync(absoluteEntry);
		if (stat.isDirectory()) {
			files.push(...listCssFiles(new URL(`${entry}/`, directory)));
			continue;
		}
		if (entry.endsWith('.css')) {
			files.push(absoluteEntry);
		}
	}
	return files;
}

function listSelectors(css: string, pattern: RegExp): Array<string> {
	return Array.from(new Set(Array.from(css.matchAll(pattern), (match) => match[1] as string))).sort((left, right) =>
		left.localeCompare(right),
	);
}

describe('ArboriumThemeBridge', () => {
	it('does not use Arborium system color-scheme switching', () => {
		expect(highlightingSource).not.toContain('@arborium/arborium/themes/base.css');
		expect(bridgeCss).not.toContain('prefers-color-scheme');
		expect(bridgeCss).not.toContain('theme-dark');
		expect(bridgeCss).not.toContain('data-theme');
	});

	it('keeps app CSS off system dark-mode media queries', () => {
		const cssFiles = listCssFiles(new URL('../../../', import.meta.url));
		expect(cssFiles.length).toBeGreaterThan(0);
		for (const file of cssFiles) {
			expect(readFileSync(file, 'utf8'), file).not.toContain('prefers-color-scheme: dark');
		}
	});

	it('uses dark token styles by default and light styles only under theme-light', () => {
		expect(getRuleBody('a-s')).toContain('color: var(--arb-s-dark);');
		expect(getRuleBody('html.theme-light a-s')).toContain('color: var(--arb-s-light);');
	});

	it('keeps every default token selector covered by a theme-light override', () => {
		const defaultSelectors = listSelectors(bridgeCss, /^(a-[\w-]+) \{/gm);
		const lightSelectors = listSelectors(bridgeCss, /^html\.theme-light (a-[\w-]+) \{/gm);
		const upstreamSelectors = listSelectors(upstreamBaseCss, /^\s*(a-[\w-]+) \{/gm);

		expect(defaultSelectors.length).toBeGreaterThan(0);
		expect(defaultSelectors).toEqual(upstreamSelectors);
		expect(lightSelectors).toEqual(upstreamSelectors);
	});
});

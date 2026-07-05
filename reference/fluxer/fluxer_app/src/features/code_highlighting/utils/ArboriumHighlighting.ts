// SPDX-License-Identifier: AGPL-3.0-or-later

import {ARBORIUM_GRAMMAR_LOADERS} from '@app/features/code_highlighting/utils/ArboriumGrammars';
import {Logger} from '@app/features/platform/utils/AppLogger';
import {MAX_CODE_HIGHLIGHT_SOURCE_LENGTH} from '@fluxer/constants/src/LimitConstants';
import {useEffect, useMemo, useState} from 'react';

type ArboriumModule = typeof import('@arborium/arborium');

const logger = new Logger('ArboriumHighlighting');
const AUTO_DETECT_LANGUAGE_CODE = 'auto';
const PLAIN_TEXT_LANGUAGE = 'text';
const LANGUAGE_ALIAS_MAP: Record<string, string> = {
	adoc: 'asciidoc',
	ansible: 'yaml',
	bat: 'batch',
	cjs: 'javascript',
	cl: 'commonlisp',
	clj: 'clojure',
	cljc: 'clojure',
	cljs: 'clojure',
	cmd: 'batch',
	comp: 'glsl',
	conf: 'ini',
	config: 'ini',
	'c#': 'c-sharp',
	cs: 'c-sharp',
	csharp: 'c-sharp',
	'c++': 'cpp',
	cc: 'cpp',
	cfg: 'ini',
	cts: 'typescript',
	cxx: 'cpp',
	diff: 'diff',
	docker: 'dockerfile',
	dts: 'devicetree',
	dtsi: 'devicetree',
	ecmascript: 'javascript',
	erl: 'erlang',
	ex: 'elixir',
	exs: 'elixir',
	'f#': 'fsharp',
	frag: 'glsl',
	fs: 'fsharp',
	fsi: 'fsharp',
	fsx: 'fsharp',
	gql: 'graphql',
	graphqls: 'graphql',
	h: 'cpp',
	hrl: 'erlang',
	hs: 'haskell',
	hh: 'cpp',
	htm: 'html',
	hpp: 'cpp',
	hxx: 'cpp',
	j2: 'jinja2',
	jinja: 'jinja2',
	js: 'javascript',
	json5: 'json',
	jsonc: 'json',
	jl: 'julia',
	jsx: 'tsx',
	kt: 'kotlin',
	kts: 'kotlin',
	ksh: 'bash',
	lisp: 'commonlisp',
	log: 'text',
	md: 'markdown',
	mdown: 'markdown',
	mjs: 'javascript',
	mkdn: 'markdown',
	ml: 'ocaml',
	mli: 'ocaml',
	mm: 'objc',
	mts: 'typescript',
	nasm: 'x86asm',
	node: 'javascript',
	'obj-c': 'objc',
	'objective-c': 'objc',
	patch: 'diff',
	pbtxt: 'textproto',
	pgsql: 'sql',
	plain: 'text',
	plaintext: 'text',
	pl: 'perl',
	plist: 'xml',
	pm: 'perl',
	postgres: 'sql',
	postgresql: 'sql',
	proto: 'textproto',
	protobuf: 'textproto',
	ps: 'postscript',
	ps1: 'powershell',
	psd1: 'powershell',
	psm1: 'powershell',
	psql: 'sql',
	pwsh: 'powershell',
	py: 'python',
	py3: 'python',
	python3: 'python',
	rb: 'ruby',
	res: 'rescript',
	resi: 'rescript',
	rq: 'sparql',
	rs: 'rust',
	scm: 'scheme',
	sh: 'bash',
	shell: 'bash',
	shellscript: 'bash',
	ss: 'scheme',
	svg: 'xml',
	sv: 'verilog',
	svh: 'verilog',
	terraform: 'hcl',
	tf: 'hcl',
	tfvars: 'hcl',
	tla: 'tlaplus',
	ts: 'typescript',
	txt: 'text',
	typ: 'typst',
	vbnet: 'vb',
	vhd: 'vhdl',
	viml: 'vim',
	vimscript: 'vim',
	vert: 'glsl',
	xhtml: 'html',
	yml: 'yaml',
	zshell: 'zsh',
};
const MAX_CACHE_ENTRIES = 500;
const highlightCache = new Map<string, Promise<string>>();

let arboriumModule: ArboriumModule | null = null;
let arboriumPromise: Promise<ArboriumModule> | null = null;

function loadArborium(): Promise<ArboriumModule> {
	if (arboriumModule) {
		return Promise.resolve(arboriumModule);
	}
	if (!arboriumPromise) {
		arboriumPromise = (async () => {
			const [arborium] = await Promise.all([
				import('@arborium/arborium'),
				import('@arborium/arborium/themes/github-dark.css'),
				import('@arborium/arborium/themes/github-light.css'),
				import('@app/features/code_highlighting/utils/ArboriumThemeBridge.css'),
			]);
			const hostWasmUrl = new URL('@arborium/arborium/arborium_host_bg.wasm', import.meta.url);
			arborium.setConfig({
				resolveHostJs: () => import('@arborium/arborium/arborium_host.js'),
				resolveHostWasm: () => fetch(hostWasmUrl),
				resolveJs: ({language}) => {
					const loader = ARBORIUM_GRAMMAR_LOADERS[language];
					if (!loader) {
						throw new Error(`No bundled arborium grammar for language '${language}'`);
					}
					return loader.loadJs();
				},
				resolveWasm: ({language}) => {
					const loader = ARBORIUM_GRAMMAR_LOADERS[language];
					if (!loader) {
						throw new Error(`No bundled arborium grammar for language '${language}'`);
					}
					return fetch(loader.wasmUrl);
				},
				logger: {
					debug: (...args: Array<unknown>) => logger.debug(...args),
					warn: (...args: Array<unknown>) => logger.warn(...args),
					error: (...args: Array<unknown>) => logger.error(...args),
				},
			});
			arboriumModule = arborium;
			return arborium;
		})();
	}
	return arboriumPromise;
}

export async function _preloadArboriumForTests(): Promise<void> {
	await loadArborium();
}

export interface HighlightLanguageOption {
	canonicalCode: string;
	code: string;
}

export let HIGHLIGHT_LANGUAGE_OPTIONS: ReadonlyArray<HighlightLanguageOption> = [
	{canonicalCode: AUTO_DETECT_LANGUAGE_CODE, code: AUTO_DETECT_LANGUAGE_CODE},
	{canonicalCode: PLAIN_TEXT_LANGUAGE, code: PLAIN_TEXT_LANGUAGE},
	{canonicalCode: PLAIN_TEXT_LANGUAGE, code: 'plaintext'},
];

const optionsListeners = new Set<() => void>();

function notifyOptionsListeners(): void {
	for (const listener of optionsListeners) {
		listener();
	}
}

function buildHighlightLanguageOptions(arborium: ArboriumModule): Array<HighlightLanguageOption> {
	const optionsMap = new Map<string, HighlightLanguageOption>();
	optionsMap.set(AUTO_DETECT_LANGUAGE_CODE, {
		canonicalCode: AUTO_DETECT_LANGUAGE_CODE,
		code: AUTO_DETECT_LANGUAGE_CODE,
	});
	for (const canonicalCode of arborium.availableLanguages) {
		optionsMap.set(canonicalCode, {canonicalCode, code: canonicalCode});
	}
	for (const [aliasCode, canonicalCode] of Object.entries(LANGUAGE_ALIAS_MAP)) {
		const isCanonical =
			canonicalCode === PLAIN_TEXT_LANGUAGE ||
			(arborium.availableLanguages as ReadonlyArray<string>).includes(canonicalCode);
		if (!isCanonical || optionsMap.has(aliasCode)) {
			continue;
		}
		optionsMap.set(aliasCode, {canonicalCode, code: aliasCode});
	}
	if (!optionsMap.has('plaintext')) {
		optionsMap.set('plaintext', {canonicalCode: PLAIN_TEXT_LANGUAGE, code: 'plaintext'});
	}
	if (!optionsMap.has('text')) {
		optionsMap.set('text', {canonicalCode: PLAIN_TEXT_LANGUAGE, code: 'text'});
	}
	return Array.from(optionsMap.values()).sort((left, right) => left.code.localeCompare(right.code));
}

function ensureOptionsBuilt(): void {
	if (!arboriumModule) {
		void loadArborium().then(() => {
			if (!arboriumModule) {
				return;
			}
			HIGHLIGHT_LANGUAGE_OPTIONS = buildHighlightLanguageOptions(arboriumModule);
			notifyOptionsListeners();
		});
		return;
	}
	if (HIGHLIGHT_LANGUAGE_OPTIONS.length <= 3) {
		HIGHLIGHT_LANGUAGE_OPTIONS = buildHighlightLanguageOptions(arboriumModule);
	}
}

export function useHighlightLanguageOptions(): ReadonlyArray<HighlightLanguageOption> {
	const [, setTick] = useState(0);
	useEffect(() => {
		ensureOptionsBuilt();
		const listener = () => setTick((tick) => tick + 1);
		optionsListeners.add(listener);
		return () => {
			optionsListeners.delete(listener);
		};
	}, []);
	return HIGHLIGHT_LANGUAGE_OPTIONS;
}

function getCacheKey(language: string, source: string): string {
	return `${language}${source}`;
}

function trimHighlightCache(): void {
	if (highlightCache.size <= MAX_CACHE_ENTRIES) {
		return;
	}
	const firstKey = highlightCache.keys().next().value;
	if (!firstKey) {
		return;
	}
	highlightCache.delete(firstKey);
}

function loadHighlightedHtml(arborium: ArboriumModule, language: string, source: string): Promise<string> {
	const cacheKey = getCacheKey(language, source);
	const cached = highlightCache.get(cacheKey);
	if (cached) {
		return cached;
	}
	const highlightedHtmlPromise = arborium.highlight(language, source).catch((error) => {
		highlightCache.delete(cacheKey);
		throw error;
	});
	highlightCache.set(cacheKey, highlightedHtmlPromise);
	trimHighlightCache();
	return highlightedHtmlPromise;
}

function getLanguageToken(language?: string | null): string | null {
	const trimmedLanguage = language?.trim();
	if (!trimmedLanguage) {
		return null;
	}
	const [primaryLanguage] = trimmedLanguage.split(/\s+/u);
	return primaryLanguage ? primaryLanguage.toLowerCase() : null;
}

export function escapeCodeHtml(value: string): string {
	return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function normalizeHighlightLanguage(language?: string | null): string | null {
	const languageToken = getLanguageToken(language);
	if (!languageToken) {
		return null;
	}
	const aliasedLanguage = LANGUAGE_ALIAS_MAP[languageToken];
	if (!arboriumModule) {
		const candidate = aliasedLanguage ?? languageToken;
		if (candidate === PLAIN_TEXT_LANGUAGE) {
			return PLAIN_TEXT_LANGUAGE;
		}
		return candidate;
	}
	const normalizedLanguage = arboriumModule.normalizeLanguage(languageToken);
	const canonicalLanguage = aliasedLanguage ?? LANGUAGE_ALIAS_MAP[normalizedLanguage] ?? normalizedLanguage;
	if (canonicalLanguage === PLAIN_TEXT_LANGUAGE) {
		return PLAIN_TEXT_LANGUAGE;
	}
	return (arboriumModule.availableLanguages as ReadonlyArray<string>).includes(canonicalLanguage)
		? canonicalLanguage
		: null;
}

export function isSupportedHighlightLanguage(language?: string | null): boolean {
	if (getLanguageToken(language) === AUTO_DETECT_LANGUAGE_CODE) {
		return true;
	}
	return normalizeHighlightLanguage(language) !== null;
}

function resolveHighlightLanguage(
	arborium: ArboriumModule,
	language?: string | null,
	source?: string | null,
): string | null {
	const languageToken = getLanguageToken(language);
	if (!languageToken) {
		return null;
	}
	if (languageToken === AUTO_DETECT_LANGUAGE_CODE) {
		const detectedLanguage = source ? arborium.detectLanguage(source) : null;
		return normalizeHighlightLanguage(detectedLanguage);
	}
	return normalizeHighlightLanguage(languageToken);
}

export async function highlightCodeHtml(language?: string | null, source?: string | null): Promise<string> {
	if (!source) {
		return '';
	}
	if (source.length > MAX_CODE_HIGHLIGHT_SOURCE_LENGTH) {
		return escapeCodeHtml(source);
	}
	const arborium = await loadArborium();
	const resolvedLanguage = resolveHighlightLanguage(arborium, language, source);
	if (!resolvedLanguage || resolvedLanguage === PLAIN_TEXT_LANGUAGE) {
		return escapeCodeHtml(source);
	}
	try {
		return await loadHighlightedHtml(arborium, resolvedLanguage, source);
	} catch (error) {
		logger.error(`Failed to highlight code with Arborium for language "${resolvedLanguage}"`, error);
		return escapeCodeHtml(source);
	}
}

export function useArboriumHighlightedHtml(language?: string | null, source?: string | null): string {
	const escapedHtml = useMemo(() => escapeCodeHtml(source ?? ''), [source]);
	const [highlightedHtml, setHighlightedHtml] = useState(escapedHtml);
	useEffect(() => {
		let cancelled = false;
		setHighlightedHtml(escapedHtml);
		if (!source) {
			return () => {
				cancelled = true;
			};
		}
		void highlightCodeHtml(language, source).then((html) => {
			if (!cancelled) {
				setHighlightedHtml(html);
			}
		});
		return () => {
			cancelled = true;
		};
	}, [escapedHtml, language, source]);
	return highlightedHtml;
}

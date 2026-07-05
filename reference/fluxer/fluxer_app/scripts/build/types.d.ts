// SPDX-License-Identifier: AGPL-3.0-or-later

declare module 'postcss' {
	interface ProcessOptions {
		from?: string;
		to?: string;
		map?: boolean | {inline?: boolean; prev?: boolean | string | object; annotation?: boolean | string};
		parser?: unknown;
		stringifier?: unknown;
		syntax?: unknown;
	}

	interface Result {
		css: string;
		map?: unknown;
		root: unknown;
		processor: unknown;
		messages: Array<unknown>;
		opts: ProcessOptions;
	}

	interface Plugin {
		postcssPlugin: string;
		Once?(root: unknown, helpers: unknown): void | Promise<void>;
		Root?(root: unknown, helpers: unknown): void | Promise<void>;
		RootExit?(root: unknown, helpers: unknown): void | Promise<void>;
		AtRule?(atRule: unknown, helpers: unknown): void | Promise<void>;
		AtRuleExit?(atRule: unknown, helpers: unknown): void | Promise<void>;
		Rule?(rule: unknown, helpers: unknown): void | Promise<void>;
		RuleExit?(rule: unknown, helpers: unknown): void | Promise<void>;
		Declaration?(declaration: unknown, helpers: unknown): void | Promise<void>;
		DeclarationExit?(declaration: unknown, helpers: unknown): void | Promise<void>;
		Comment?(comment: unknown, helpers: unknown): void | Promise<void>;
		CommentExit?(comment: unknown, helpers: unknown): void | Promise<void>;
	}

	interface Processor {
		process(css: string, options?: ProcessOptions): Promise<Result>;
	}

	function postcss(plugins?: Array<Plugin | ((options?: unknown) => Plugin)>): Processor;

	export default postcss;
}

declare module 'postcss-modules' {
	interface PostcssModulesOptions {
		localsConvention?:
			| 'camelCase'
			| 'camelCaseOnly'
			| 'dashes'
			| 'dashesOnly'
			| ((originalClassName: string, generatedClassName: string, inputFile: string) => string);
		generateScopedName?: string | ((name: string, filename: string, css: string) => string);
		getJSON?(cssFileName: string, json: Record<string, string>, outputFileName?: string): void;
		hashPrefix?: string;
		scopeBehaviour?: 'global' | 'local';
		globalModulePaths?: Array<RegExp>;
		root?: string;
	}

	function postcssModules(options?: PostcssModulesOptions): import('postcss').Plugin;

	export default postcssModules;
}

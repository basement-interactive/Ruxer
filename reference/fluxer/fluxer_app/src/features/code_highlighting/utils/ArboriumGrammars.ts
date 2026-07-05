// SPDX-License-Identifier: AGPL-3.0-or-later

export interface ArboriumGrammarLoader {
	loadJs: () => Promise<unknown>;
	wasmUrl: URL;
}

export const ARBORIUM_GRAMMAR_LOADERS: Readonly<Record<string, ArboriumGrammarLoader>> = {
	ada: {
		loadJs: () => import('@arborium/ada/grammar.js'),
		wasmUrl: new URL('@arborium/ada/grammar_bg.wasm', import.meta.url),
	},
	agda: {
		loadJs: () => import('@arborium/agda/grammar.js'),
		wasmUrl: new URL('@arborium/agda/grammar_bg.wasm', import.meta.url),
	},
	asciidoc: {
		loadJs: () => import('@arborium/asciidoc/grammar.js'),
		wasmUrl: new URL('@arborium/asciidoc/grammar_bg.wasm', import.meta.url),
	},
	asm: {
		loadJs: () => import('@arborium/asm/grammar.js'),
		wasmUrl: new URL('@arborium/asm/grammar_bg.wasm', import.meta.url),
	},
	awk: {
		loadJs: () => import('@arborium/awk/grammar.js'),
		wasmUrl: new URL('@arborium/awk/grammar_bg.wasm', import.meta.url),
	},
	bash: {
		loadJs: () => import('@arborium/bash/grammar.js'),
		wasmUrl: new URL('@arborium/bash/grammar_bg.wasm', import.meta.url),
	},
	batch: {
		loadJs: () => import('@arborium/batch/grammar.js'),
		wasmUrl: new URL('@arborium/batch/grammar_bg.wasm', import.meta.url),
	},
	c: {
		loadJs: () => import('@arborium/c/grammar.js'),
		wasmUrl: new URL('@arborium/c/grammar_bg.wasm', import.meta.url),
	},
	'c-sharp': {
		loadJs: () => import('@arborium/c-sharp/grammar.js'),
		wasmUrl: new URL('@arborium/c-sharp/grammar_bg.wasm', import.meta.url),
	},
	caddy: {
		loadJs: () => import('@arborium/caddy/grammar.js'),
		wasmUrl: new URL('@arborium/caddy/grammar_bg.wasm', import.meta.url),
	},
	capnp: {
		loadJs: () => import('@arborium/capnp/grammar.js'),
		wasmUrl: new URL('@arborium/capnp/grammar_bg.wasm', import.meta.url),
	},
	cedar: {
		loadJs: () => import('@arborium/cedar/grammar.js'),
		wasmUrl: new URL('@arborium/cedar/grammar_bg.wasm', import.meta.url),
	},
	cedarschema: {
		loadJs: () => import('@arborium/cedarschema/grammar.js'),
		wasmUrl: new URL('@arborium/cedarschema/grammar_bg.wasm', import.meta.url),
	},
	clojure: {
		loadJs: () => import('@arborium/clojure/grammar.js'),
		wasmUrl: new URL('@arborium/clojure/grammar_bg.wasm', import.meta.url),
	},
	cmake: {
		loadJs: () => import('@arborium/cmake/grammar.js'),
		wasmUrl: new URL('@arborium/cmake/grammar_bg.wasm', import.meta.url),
	},
	cobol: {
		loadJs: () => import('@arborium/cobol/grammar.js'),
		wasmUrl: new URL('@arborium/cobol/grammar_bg.wasm', import.meta.url),
	},
	commonlisp: {
		loadJs: () => import('@arborium/commonlisp/grammar.js'),
		wasmUrl: new URL('@arborium/commonlisp/grammar_bg.wasm', import.meta.url),
	},
	cpp: {
		loadJs: () => import('@arborium/cpp/grammar.js'),
		wasmUrl: new URL('@arborium/cpp/grammar_bg.wasm', import.meta.url),
	},
	css: {
		loadJs: () => import('@arborium/css/grammar.js'),
		wasmUrl: new URL('@arborium/css/grammar_bg.wasm', import.meta.url),
	},
	d: {
		loadJs: () => import('@arborium/d/grammar.js'),
		wasmUrl: new URL('@arborium/d/grammar_bg.wasm', import.meta.url),
	},
	dart: {
		loadJs: () => import('@arborium/dart/grammar.js'),
		wasmUrl: new URL('@arborium/dart/grammar_bg.wasm', import.meta.url),
	},
	devicetree: {
		loadJs: () => import('@arborium/devicetree/grammar.js'),
		wasmUrl: new URL('@arborium/devicetree/grammar_bg.wasm', import.meta.url),
	},
	diff: {
		loadJs: () => import('@arborium/diff/grammar.js'),
		wasmUrl: new URL('@arborium/diff/grammar_bg.wasm', import.meta.url),
	},
	dockerfile: {
		loadJs: () => import('@arborium/dockerfile/grammar.js'),
		wasmUrl: new URL('@arborium/dockerfile/grammar_bg.wasm', import.meta.url),
	},
	dot: {
		loadJs: () => import('@arborium/dot/grammar.js'),
		wasmUrl: new URL('@arborium/dot/grammar_bg.wasm', import.meta.url),
	},
	elisp: {
		loadJs: () => import('@arborium/elisp/grammar.js'),
		wasmUrl: new URL('@arborium/elisp/grammar_bg.wasm', import.meta.url),
	},
	elixir: {
		loadJs: () => import('@arborium/elixir/grammar.js'),
		wasmUrl: new URL('@arborium/elixir/grammar_bg.wasm', import.meta.url),
	},
	elm: {
		loadJs: () => import('@arborium/elm/grammar.js'),
		wasmUrl: new URL('@arborium/elm/grammar_bg.wasm', import.meta.url),
	},
	erlang: {
		loadJs: () => import('@arborium/erlang/grammar.js'),
		wasmUrl: new URL('@arborium/erlang/grammar_bg.wasm', import.meta.url),
	},
	fish: {
		loadJs: () => import('@arborium/fish/grammar.js'),
		wasmUrl: new URL('@arborium/fish/grammar_bg.wasm', import.meta.url),
	},
	fsharp: {
		loadJs: () => import('@arborium/fsharp/grammar.js'),
		wasmUrl: new URL('@arborium/fsharp/grammar_bg.wasm', import.meta.url),
	},
	gleam: {
		loadJs: () => import('@arborium/gleam/grammar.js'),
		wasmUrl: new URL('@arborium/gleam/grammar_bg.wasm', import.meta.url),
	},
	glsl: {
		loadJs: () => import('@arborium/glsl/grammar.js'),
		wasmUrl: new URL('@arborium/glsl/grammar_bg.wasm', import.meta.url),
	},
	go: {
		loadJs: () => import('@arborium/go/grammar.js'),
		wasmUrl: new URL('@arborium/go/grammar_bg.wasm', import.meta.url),
	},
	graphql: {
		loadJs: () => import('@arborium/graphql/grammar.js'),
		wasmUrl: new URL('@arborium/graphql/grammar_bg.wasm', import.meta.url),
	},
	groovy: {
		loadJs: () => import('@arborium/groovy/grammar.js'),
		wasmUrl: new URL('@arborium/groovy/grammar_bg.wasm', import.meta.url),
	},
	haskell: {
		loadJs: () => import('@arborium/haskell/grammar.js'),
		wasmUrl: new URL('@arborium/haskell/grammar_bg.wasm', import.meta.url),
	},
	hcl: {
		loadJs: () => import('@arborium/hcl/grammar.js'),
		wasmUrl: new URL('@arborium/hcl/grammar_bg.wasm', import.meta.url),
	},
	hlsl: {
		loadJs: () => import('@arborium/hlsl/grammar.js'),
		wasmUrl: new URL('@arborium/hlsl/grammar_bg.wasm', import.meta.url),
	},
	html: {
		loadJs: () => import('@arborium/html/grammar.js'),
		wasmUrl: new URL('@arborium/html/grammar_bg.wasm', import.meta.url),
	},
	idris: {
		loadJs: () => import('@arborium/idris/grammar.js'),
		wasmUrl: new URL('@arborium/idris/grammar_bg.wasm', import.meta.url),
	},
	ini: {
		loadJs: () => import('@arborium/ini/grammar.js'),
		wasmUrl: new URL('@arborium/ini/grammar_bg.wasm', import.meta.url),
	},
	java: {
		loadJs: () => import('@arborium/java/grammar.js'),
		wasmUrl: new URL('@arborium/java/grammar_bg.wasm', import.meta.url),
	},
	javascript: {
		loadJs: () => import('@arborium/javascript/grammar.js'),
		wasmUrl: new URL('@arborium/javascript/grammar_bg.wasm', import.meta.url),
	},
	jinja2: {
		loadJs: () => import('@arborium/jinja2/grammar.js'),
		wasmUrl: new URL('@arborium/jinja2/grammar_bg.wasm', import.meta.url),
	},
	jq: {
		loadJs: () => import('@arborium/jq/grammar.js'),
		wasmUrl: new URL('@arborium/jq/grammar_bg.wasm', import.meta.url),
	},
	json: {
		loadJs: () => import('@arborium/json/grammar.js'),
		wasmUrl: new URL('@arborium/json/grammar_bg.wasm', import.meta.url),
	},
	julia: {
		loadJs: () => import('@arborium/julia/grammar.js'),
		wasmUrl: new URL('@arborium/julia/grammar_bg.wasm', import.meta.url),
	},
	kotlin: {
		loadJs: () => import('@arborium/kotlin/grammar.js'),
		wasmUrl: new URL('@arborium/kotlin/grammar_bg.wasm', import.meta.url),
	},
	lean: {
		loadJs: () => import('@arborium/lean/grammar.js'),
		wasmUrl: new URL('@arborium/lean/grammar_bg.wasm', import.meta.url),
	},
	lua: {
		loadJs: () => import('@arborium/lua/grammar.js'),
		wasmUrl: new URL('@arborium/lua/grammar_bg.wasm', import.meta.url),
	},
	markdown: {
		loadJs: () => import('@arborium/markdown/grammar.js'),
		wasmUrl: new URL('@arborium/markdown/grammar_bg.wasm', import.meta.url),
	},
	matlab: {
		loadJs: () => import('@arborium/matlab/grammar.js'),
		wasmUrl: new URL('@arborium/matlab/grammar_bg.wasm', import.meta.url),
	},
	meson: {
		loadJs: () => import('@arborium/meson/grammar.js'),
		wasmUrl: new URL('@arborium/meson/grammar_bg.wasm', import.meta.url),
	},
	nginx: {
		loadJs: () => import('@arborium/nginx/grammar.js'),
		wasmUrl: new URL('@arborium/nginx/grammar_bg.wasm', import.meta.url),
	},
	ninja: {
		loadJs: () => import('@arborium/ninja/grammar.js'),
		wasmUrl: new URL('@arborium/ninja/grammar_bg.wasm', import.meta.url),
	},
	nix: {
		loadJs: () => import('@arborium/nix/grammar.js'),
		wasmUrl: new URL('@arborium/nix/grammar_bg.wasm', import.meta.url),
	},
	objc: {
		loadJs: () => import('@arborium/objc/grammar.js'),
		wasmUrl: new URL('@arborium/objc/grammar_bg.wasm', import.meta.url),
	},
	ocaml: {
		loadJs: () => import('@arborium/ocaml/grammar.js'),
		wasmUrl: new URL('@arborium/ocaml/grammar_bg.wasm', import.meta.url),
	},
	perl: {
		loadJs: () => import('@arborium/perl/grammar.js'),
		wasmUrl: new URL('@arborium/perl/grammar_bg.wasm', import.meta.url),
	},
	php: {
		loadJs: () => import('@arborium/php/grammar.js'),
		wasmUrl: new URL('@arborium/php/grammar_bg.wasm', import.meta.url),
	},
	postscript: {
		loadJs: () => import('@arborium/postscript/grammar.js'),
		wasmUrl: new URL('@arborium/postscript/grammar_bg.wasm', import.meta.url),
	},
	powershell: {
		loadJs: () => import('@arborium/powershell/grammar.js'),
		wasmUrl: new URL('@arborium/powershell/grammar_bg.wasm', import.meta.url),
	},
	prolog: {
		loadJs: () => import('@arborium/prolog/grammar.js'),
		wasmUrl: new URL('@arborium/prolog/grammar_bg.wasm', import.meta.url),
	},
	python: {
		loadJs: () => import('@arborium/python/grammar.js'),
		wasmUrl: new URL('@arborium/python/grammar_bg.wasm', import.meta.url),
	},
	query: {
		loadJs: () => import('@arborium/query/grammar.js'),
		wasmUrl: new URL('@arborium/query/grammar_bg.wasm', import.meta.url),
	},
	r: {
		loadJs: () => import('@arborium/r/grammar.js'),
		wasmUrl: new URL('@arborium/r/grammar_bg.wasm', import.meta.url),
	},
	rego: {
		loadJs: () => import('@arborium/rego/grammar.js'),
		wasmUrl: new URL('@arborium/rego/grammar_bg.wasm', import.meta.url),
	},
	rescript: {
		loadJs: () => import('@arborium/rescript/grammar.js'),
		wasmUrl: new URL('@arborium/rescript/grammar_bg.wasm', import.meta.url),
	},
	ron: {
		loadJs: () => import('@arborium/ron/grammar.js'),
		wasmUrl: new URL('@arborium/ron/grammar_bg.wasm', import.meta.url),
	},
	ruby: {
		loadJs: () => import('@arborium/ruby/grammar.js'),
		wasmUrl: new URL('@arborium/ruby/grammar_bg.wasm', import.meta.url),
	},
	rust: {
		loadJs: () => import('@arborium/rust/grammar.js'),
		wasmUrl: new URL('@arborium/rust/grammar_bg.wasm', import.meta.url),
	},
	scala: {
		loadJs: () => import('@arborium/scala/grammar.js'),
		wasmUrl: new URL('@arborium/scala/grammar_bg.wasm', import.meta.url),
	},
	scheme: {
		loadJs: () => import('@arborium/scheme/grammar.js'),
		wasmUrl: new URL('@arborium/scheme/grammar_bg.wasm', import.meta.url),
	},
	scss: {
		loadJs: () => import('@arborium/scss/grammar.js'),
		wasmUrl: new URL('@arborium/scss/grammar_bg.wasm', import.meta.url),
	},
	solidity: {
		loadJs: () => import('@arborium/solidity/grammar.js'),
		wasmUrl: new URL('@arborium/solidity/grammar_bg.wasm', import.meta.url),
	},
	sparql: {
		loadJs: () => import('@arborium/sparql/grammar.js'),
		wasmUrl: new URL('@arborium/sparql/grammar_bg.wasm', import.meta.url),
	},
	sql: {
		loadJs: () => import('@arborium/sql/grammar.js'),
		wasmUrl: new URL('@arborium/sql/grammar_bg.wasm', import.meta.url),
	},
	'ssh-config': {
		loadJs: () => import('@arborium/ssh-config/grammar.js'),
		wasmUrl: new URL('@arborium/ssh-config/grammar_bg.wasm', import.meta.url),
	},
	starlark: {
		loadJs: () => import('@arborium/starlark/grammar.js'),
		wasmUrl: new URL('@arborium/starlark/grammar_bg.wasm', import.meta.url),
	},
	styx: {
		loadJs: () => import('@arborium/styx/grammar.js'),
		wasmUrl: new URL('@arborium/styx/grammar_bg.wasm', import.meta.url),
	},
	svelte: {
		loadJs: () => import('@arborium/svelte/grammar.js'),
		wasmUrl: new URL('@arborium/svelte/grammar_bg.wasm', import.meta.url),
	},
	swift: {
		loadJs: () => import('@arborium/swift/grammar.js'),
		wasmUrl: new URL('@arborium/swift/grammar_bg.wasm', import.meta.url),
	},
	textproto: {
		loadJs: () => import('@arborium/textproto/grammar.js'),
		wasmUrl: new URL('@arborium/textproto/grammar_bg.wasm', import.meta.url),
	},
	thrift: {
		loadJs: () => import('@arborium/thrift/grammar.js'),
		wasmUrl: new URL('@arborium/thrift/grammar_bg.wasm', import.meta.url),
	},
	tlaplus: {
		loadJs: () => import('@arborium/tlaplus/grammar.js'),
		wasmUrl: new URL('@arborium/tlaplus/grammar_bg.wasm', import.meta.url),
	},
	toml: {
		loadJs: () => import('@arborium/toml/grammar.js'),
		wasmUrl: new URL('@arborium/toml/grammar_bg.wasm', import.meta.url),
	},
	tsx: {
		loadJs: () => import('@arborium/tsx/grammar.js'),
		wasmUrl: new URL('@arborium/tsx/grammar_bg.wasm', import.meta.url),
	},
	typescript: {
		loadJs: () => import('@arborium/typescript/grammar.js'),
		wasmUrl: new URL('@arborium/typescript/grammar_bg.wasm', import.meta.url),
	},
	typst: {
		loadJs: () => import('@arborium/typst/grammar.js'),
		wasmUrl: new URL('@arborium/typst/grammar_bg.wasm', import.meta.url),
	},
	uiua: {
		loadJs: () => import('@arborium/uiua/grammar.js'),
		wasmUrl: new URL('@arborium/uiua/grammar_bg.wasm', import.meta.url),
	},
	vb: {
		loadJs: () => import('@arborium/vb/grammar.js'),
		wasmUrl: new URL('@arborium/vb/grammar_bg.wasm', import.meta.url),
	},
	verilog: {
		loadJs: () => import('@arborium/verilog/grammar.js'),
		wasmUrl: new URL('@arborium/verilog/grammar_bg.wasm', import.meta.url),
	},
	vhdl: {
		loadJs: () => import('@arborium/vhdl/grammar.js'),
		wasmUrl: new URL('@arborium/vhdl/grammar_bg.wasm', import.meta.url),
	},
	vim: {
		loadJs: () => import('@arborium/vim/grammar.js'),
		wasmUrl: new URL('@arborium/vim/grammar_bg.wasm', import.meta.url),
	},
	vue: {
		loadJs: () => import('@arborium/vue/grammar.js'),
		wasmUrl: new URL('@arborium/vue/grammar_bg.wasm', import.meta.url),
	},
	wit: {
		loadJs: () => import('@arborium/wit/grammar.js'),
		wasmUrl: new URL('@arborium/wit/grammar_bg.wasm', import.meta.url),
	},
	x86asm: {
		loadJs: () => import('@arborium/x86asm/grammar.js'),
		wasmUrl: new URL('@arborium/x86asm/grammar_bg.wasm', import.meta.url),
	},
	xml: {
		loadJs: () => import('@arborium/xml/grammar.js'),
		wasmUrl: new URL('@arborium/xml/grammar_bg.wasm', import.meta.url),
	},
	yaml: {
		loadJs: () => import('@arborium/yaml/grammar.js'),
		wasmUrl: new URL('@arborium/yaml/grammar_bg.wasm', import.meta.url),
	},
	yuri: {
		loadJs: () => import('@arborium/yuri/grammar.js'),
		wasmUrl: new URL('@arborium/yuri/grammar_bg.wasm', import.meta.url),
	},
	zig: {
		loadJs: () => import('@arborium/zig/grammar.js'),
		wasmUrl: new URL('@arborium/zig/grammar_bg.wasm', import.meta.url),
	},
	zsh: {
		loadJs: () => import('@arborium/zsh/grammar.js'),
		wasmUrl: new URL('@arborium/zsh/grammar_bg.wasm', import.meta.url),
	},
};

// SPDX-License-Identifier: AGPL-3.0-or-later
// Post-build processor: turn the rspack `dist/` into a Tauri-loadable bundle.
//
// The reference index.html ships with placeholders normally filled by
// fluxer_app_proxy at serve time:
//   {{STATIC_CDN_ENDPOINT}}   — CDN origin for fonts/icons
//   <!--{{FLUXER_BOOTSTRAP}}--> — injection point for window.__FLUXER_BOOTSTRAP__
//   {{CSP_NONCE_PLACEHOLDER}}  — per-request CSP nonce
//
// In the Tauri webview there is no proxy, so we fill these statically here.
// The bootstrap object is fetched live from web.fluxer.app's well-known
// document (the exact object the real app serves), then its REST endpoint is
// rewritten to the *public* API (api_public) which performs no Origin
// allowlist check — required because a Tauri webview's origin is not in the
// browser API's allowlist.

import {readFileSync, writeFileSync, existsSync} from 'node:fs';
import path, {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(__dirname, '..', 'dist');
const INDEX = path.join(DIST, 'index.html');

const WELL_KNOWN = process.env.FLUXER_WELL_KNOWN ?? 'https://web.fluxer.app/.well-known/fluxer';

async function fetchBootstrap() {
	const res = await fetch(WELL_KNOWN, {headers: {Accept: 'text/html'}});
	if (!res.ok) throw new Error(`well-known fetch failed: ${res.status}`);
	const html = await res.text();
	const marker = 'window.__FLUXER_BOOTSTRAP__';
	const start = html.indexOf(marker);
	if (start < 0) throw new Error('could not find __FLUXER_BOOTSTRAP__ in well-known');
	const braceStart = html.indexOf('{', start);
	if (braceStart < 0) throw new Error('no JSON object after __FLUXER_BOOTSTRAP__');
	// Brace-match to find the end of the (nested) JSON object.
	let depth = 0;
	let end = -1;
	let inStr = false;
	let esc = false;
	for (let i = braceStart; i < html.length; i++) {
		const c = html[i];
		if (inStr) {
			if (esc) esc = false;
			else if (c === '\\') esc = true;
			else if (c === '"') inStr = false;
			continue;
		}
		if (c === '"') inStr = true;
		else if (c === '{') depth++;
		else if (c === '}') {
			depth--;
			if (depth === 0) {
				end = i + 1;
				break;
			}
		}
	}
	if (end < 0) throw new Error('unterminated __FLUXER_BOOTSTRAP__ object');
	const bootstrap = JSON.parse(html.slice(braceStart, end));
	// Rewrite REST endpoint to the public (no-origin-check) API so the webview
	// is not rejected with INVALID_API_ORIGIN.
	const apiPublic = bootstrap.instance?.endpoints?.api_public;
	if (apiPublic) {
		bootstrap.config = bootstrap.config ?? {};
		bootstrap.config.bootstrapApiEndpoint = apiPublic;
		bootstrap.config.bootstrapApiPublicEndpoint = apiPublic;
		if (bootstrap.instance?.endpoints) {
			bootstrap.instance.endpoints.api = apiPublic;
			bootstrap.instance.endpoints.api_client = apiPublic;
		}
	}
	return bootstrap;
}

async function main() {
	if (!existsSync(INDEX)) throw new Error(`missing ${INDEX} — run rspack build first`);
	const bootstrap = await fetchBootstrap();
	const staticCdn = bootstrap.instance?.endpoints?.static_cdn ?? 'https://fluxerstatic.com';

	let html = readFileSync(INDEX, 'utf8');
	html = html.replaceAll('{{STATIC_CDN_ENDPOINT}}', staticCdn);
	// Strip CSP nonce attributes entirely (Tauri webview has no nonce source).
	html = html.replaceAll(' nonce="{{CSP_NONCE_PLACEHOLDER}}"', '');
	html = html.replaceAll('{{CSP_NONCE_PLACEHOLDER}}', '');

	// Preconnect to the media + static CDNs so the FIRST avatar/attachment/embed
	// load skips DNS + TLS handshake (saves ~100-300ms per new origin on first
	// media). The template only preconnects the static CDN; user media lives on
	// a separate origin (fluxerusercontent.com) that must be warmed too.
	const ep = bootstrap.instance?.endpoints ?? {};
	const preconnectOrigins = [ep.media, ep.static_cdn]
		.filter(Boolean)
		.map((u) => {
			try {
				return new URL(u).origin;
			} catch {
				return null;
			}
		})
		.filter((o, i, a) => o && a.indexOf(o) === i);
	const preconnectTags = preconnectOrigins
		.map((o) => `<link rel="preconnect" href="${o}" crossorigin><link rel="dns-prefetch" href="${o}">`)
		.join('');
	if (preconnectTags) {
		html = html.replace('</head>', `${preconnectTags}</head>`);
	}

	// NOTE: window.__FLUXER_BOOTSTRAP__ is injected by the Tauri Rust backend as
	// an initialization_script (it must carry the live loopback-proxy port), so
	// we deliberately do NOT inject a bootstrap object here. Remove the leftover
	// template comment and any previously-injected bootstrap script (idempotent
	// across repeated postbuild runs).
	html = html.replace('<!--{{FLUXER_BOOTSTRAP}}-->', '');
	html = html.replace(/<script>window\.__FLUXER_BOOTSTRAP__=[\s\S]*?<\/script>/g, '');

	writeFileSync(INDEX, html, 'utf8');

	// Neutralize the service worker for the Tauri webview. The reference SW
	// intercepts fetches and expects to be served over http(s) from the real
	// origin; under Tauri's custom protocol it conflicts. Web-mode boot runs
	// fine without it. (Native parity in the electron-shim phase unregisters
	// the SW automatically via isNativeDesktopClient().)
	const sw = path.join(DIST, 'sw.js');
	if (existsSync(sw)) {
		writeFileSync(sw, '// disabled for Tauri webview\nself.addEventListener("install",()=>self.skipWaiting());\nself.addEventListener("activate",(e)=>e.waitUntil(self.registration.unregister()));\n', 'utf8');
		console.log('[tauri-postbuild] neutralized sw.js');
	}

	console.log(`[tauri-postbuild] injected bootstrap (api=${bootstrap.instance?.endpoints?.api}), static_cdn=${staticCdn}`);
}

main().catch((err) => {
	console.error('[tauri-postbuild] failed:', err);
	process.exit(1);
});

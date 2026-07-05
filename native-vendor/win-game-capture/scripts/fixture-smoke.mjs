#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later

import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname, join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {fileURLToPath} from 'node:url';

const require = createRequire(import.meta.url);
const capture = require('../index.js');

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DEFAULT_FIXTURES = ['d3d11-present-fixture'];
const ALL_FIXTURES = [
	'd3d9-present-fixture',
	'd3d10-present-fixture',
	'd3d11-present-fixture',
	'd3d12-present-fixture',
	'opengl-swapbuffers-fixture',
	'vulkan-present-fixture',
];
const WIDTH = Number.parseInt(process.env.FLUXER_WIN_GAME_CAPTURE_FIXTURE_WIDTH ?? '640', 10);
const HEIGHT = Number.parseInt(process.env.FLUXER_WIN_GAME_CAPTURE_FIXTURE_HEIGHT ?? '360', 10);
const FRAME_RATE = Number.parseInt(process.env.FLUXER_WIN_GAME_CAPTURE_FIXTURE_FPS ?? '30', 10);
const START_TIMEOUT_MS = Number.parseInt(process.env.FLUXER_WIN_GAME_CAPTURE_FIXTURE_START_TIMEOUT_MS ?? '15000', 10);
const FRAME_TIMEOUT_MS = Number.parseInt(process.env.FLUXER_WIN_GAME_CAPTURE_FIXTURE_FRAME_TIMEOUT_MS ?? '15000', 10);

const TRANSPORT_MEMORY = 0;
const TRANSPORT_SHARED_TEXTURE = 1;

const API_OPENGL = 1;
const API_D3D9 = 3;
const API_D3D10 = 4;
const API_D3D11 = 5;
const API_D3D12 = 6;
const API_VULKAN = 7;

const FALLBACK_NONE = 0;
const FALLBACK_SHARED_TEXTURE_UNSUPPORTED = 1;

const EXPECTED_DIAGNOSTICS = {
	'd3d9-present-fixture': {
		apiType: API_D3D9,
		transport: TRANSPORT_SHARED_TEXTURE,
		fallbackReason: FALLBACK_NONE,
		requiresDxgiFormat: true,
	},
	'd3d10-present-fixture': {
		apiType: API_D3D10,
		transport: TRANSPORT_SHARED_TEXTURE,
		fallbackReason: FALLBACK_NONE,
		requiresDxgiFormat: true,
	},
	'd3d11-present-fixture': {
		apiType: API_D3D11,
		transport: TRANSPORT_SHARED_TEXTURE,
		fallbackReason: FALLBACK_NONE,
		requiresDxgiFormat: true,
	},
	'd3d12-present-fixture': {
		apiType: API_D3D12,
		transport: TRANSPORT_SHARED_TEXTURE,
		fallbackReason: FALLBACK_NONE,
		requiresDxgiFormat: true,
	},
	'opengl-swapbuffers-fixture': {
		apiType: API_OPENGL,
		transportOneOf: [TRANSPORT_SHARED_TEXTURE, TRANSPORT_MEMORY],
		fallbackReasonOneOf: [FALLBACK_NONE, FALLBACK_SHARED_TEXTURE_UNSUPPORTED],
		requiresDxgiFormatWhenShared: true,
	},
	'vulkan-present-fixture': {
		apiType: API_VULKAN,
		transport: TRANSPORT_SHARED_TEXTURE,
		fallbackReason: FALLBACK_NONE,
		requiresDxgiFormat: true,
	},
	'i686-present-fixture': {
		apiType: API_D3D11,
		transport: TRANSPORT_SHARED_TEXTURE,
		fallbackReason: FALLBACK_NONE,
		requiresDxgiFormat: true,
	},
};

function envFlag(name) {
	return /^(1|true|yes|on)$/i.test(process.env[name] ?? '');
}

function selectedFixtures() {
	const raw = process.argv.slice(2).join(',') || process.env.FLUXER_WIN_GAME_CAPTURE_FIXTURES || '';
	if (!raw.trim()) return DEFAULT_FIXTURES;
	const names = raw
		.split(',')
		.map((name) => name.trim())
		.filter(Boolean);
	return names.flatMap((name) => (name === 'all' ? ALL_FIXTURES : [name]));
}

function fixtureTarget(fixture) {
	return fixture === 'i686-present-fixture' ? 'i686-pc-windows-msvc' : null;
}

function fixtureExePath(fixture) {
	const target = fixtureTarget(fixture);
	const targetDir = target
		? join(ROOT, 'test-apps', fixture, 'target', target, 'release')
		: join(ROOT, 'test-apps', fixture, 'target', 'release');
	return join(targetDir, `${fixture}.exe`);
}

function envKeyForFixture(fixture) {
	return `FLUXER_WIN_GAME_CAPTURE_FIXTURE_ARGS_${fixture.toUpperCase().replaceAll(/[^A-Z0-9]+/g, '_')}`;
}

function fixtureEnvValue(baseName, fixture) {
	const fixtureKey = `${baseName}_${fixture.toUpperCase().replaceAll(/[^A-Z0-9]+/g, '_')}`;
	return process.env[fixtureKey] ?? process.env[baseName];
}

function splitExtraArgs(raw) {
	return (raw ?? '')
		.split(/\s+/)
		.map((arg) => arg.trim())
		.filter(Boolean);
}

function extraFixtureArgs(fixture) {
	return [
		...splitExtraArgs(process.env.FLUXER_WIN_GAME_CAPTURE_FIXTURE_ARGS),
		...splitExtraArgs(process.env[envKeyForFixture(fixture)]),
	];
}

function diagnosticOverride(baseName, fixture) {
	const raw = fixtureEnvValue(baseName, fixture);
	if (raw === undefined || raw === '') return undefined;
	const value = Number.parseInt(raw, 10);
	if (!Number.isFinite(value)) throw new Error(`Invalid ${baseName} override: ${raw}`);
	return value;
}

function runCommand(command, args, options = {}) {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			cwd: options.cwd ?? ROOT,
			env: process.env,
			stdio: options.stdio ?? ['ignore', 'pipe', 'pipe'],
			windowsHide: false,
		});
		let stdout = '';
		let stderr = '';
		child.stdout?.on('data', (chunk) => {
			stdout += chunk.toString();
			if (options.echo) process.stdout.write(chunk);
		});
		child.stderr?.on('data', (chunk) => {
			stderr += chunk.toString();
			if (options.echo) process.stderr.write(chunk);
		});
		child.once('error', reject);
		child.once('exit', (code, signal) => {
			if (code === 0) {
				resolve({stdout, stderr});
				return;
			}
			reject(new Error(`${command} ${args.join(' ')} failed with ${signal ?? code}\n${stderr || stdout}`));
		});
	});
}

async function buildFixture(fixture) {
	const manifest = join(ROOT, 'test-apps', fixture, 'Cargo.toml');
	if (!existsSync(manifest)) throw new Error(`unknown fixture: ${fixture}`);
	const exe = fixtureExePath(fixture);
	if (envFlag('FLUXER_WIN_GAME_CAPTURE_FIXTURE_SKIP_BUILD') && existsSync(exe)) {
		console.log(`[fixture-smoke] using existing ${fixture}`);
		return exe;
	}
	const args = ['build', '--release', '--manifest-path', manifest];
	const target = fixtureTarget(fixture);
	if (target) args.push('--target', target);
	console.log(`[fixture-smoke] building ${fixture}`);
	await runCommand('cargo', args, {echo: envFlag('FLUXER_WIN_GAME_CAPTURE_FIXTURE_VERBOSE')});
	if (!existsSync(exe)) throw new Error(`fixture build did not produce ${exe}`);
	return exe;
}

function waitForHwnd(child, fixture) {
	return new Promise((resolve, reject) => {
		let stdout = '';
		let stderr = '';
		const timeout = setTimeout(() => {
			reject(new Error(`${fixture} did not print HWND within ${START_TIMEOUT_MS}ms\n${stderr || stdout}`));
		}, START_TIMEOUT_MS);
		const finish = (hwnd) => {
			clearTimeout(timeout);
			resolve(hwnd);
		};
		child.stdout.on('data', (chunk) => {
			const text = chunk.toString();
			stdout += text;
			const match = stdout.match(/HWND=(\d+)/);
			if (match) finish(match[1]);
		});
		child.stderr.on('data', (chunk) => {
			stderr += chunk.toString();
			if (envFlag('FLUXER_WIN_GAME_CAPTURE_FIXTURE_VERBOSE')) process.stderr.write(chunk);
		});
		child.once('exit', (code, signal) => {
			clearTimeout(timeout);
			reject(new Error(`${fixture} exited before capture started (${signal ?? code})\n${stderr || stdout}`));
		});
	});
}

function frameSignature(frame) {
	const bytes = frame.data;
	const width = Math.max(1, frame.width);
	const height = Math.max(1, frame.height);
	const stride = Math.max(1, frame.strideY || (frame.format === 'bgra' ? width * 4 : width));
	const rows = frame.format === 'bgra' ? Math.min(height, 12) : Math.min(height, 32);
	let hash = 2166136261;
	for (let y = 0; y < rows; y += 1) {
		const row = y * stride;
		const rowBytes = frame.format === 'bgra' ? Math.min(stride, width * 4, 256) : Math.min(stride, width, 256);
		for (let x = 0; x < rowBytes; x += 4) {
			hash ^= bytes[row + x] ?? 0;
			hash = Math.imul(hash, 16777619) >>> 0;
		}
	}
	return hash >>> 0;
}

async function waitForAdvancingFrames(screenCapture, fixture) {
	const signatures = new Set();
	let frameCount = 0;
	let lastDiagnostics = null;
	const onFrame = (frame) => {
		frameCount += 1;
		signatures.add(frameSignature(frame));
		lastDiagnostics = screenCapture.getDiagnostics?.() ?? lastDiagnostics;
	};
	screenCapture.on('frame', onFrame);
	const start = Date.now();
	try {
		while (Date.now() - start < FRAME_TIMEOUT_MS) {
			lastDiagnostics = screenCapture.getDiagnostics?.() ?? lastDiagnostics;
			const nativeFrames = Number(lastDiagnostics?.frameCounter ?? 0);
			if (frameCount >= 3 && (signatures.size >= 2 || nativeFrames >= 3)) {
				return {frameCount, signatures: signatures.size, diagnostics: lastDiagnostics};
			}
			await delay(100);
		}
		throw new Error(
			`${fixture} capture did not deliver advancing frames within ${FRAME_TIMEOUT_MS}ms (frames=${frameCount}, signatures=${signatures.size}, diagnostics=${JSON.stringify(lastDiagnostics)})`,
		);
	} finally {
		screenCapture.off('frame', onFrame);
	}
}

function assertEqualDiagnostic(fixture, diagnostics, key, expected) {
	if (diagnostics?.[key] !== expected) {
		throw new Error(`${fixture} expected diagnostics.${key}=${expected}, got ${JSON.stringify(diagnostics)}`);
	}
}

function assertOneOfDiagnostic(fixture, diagnostics, key, expected) {
	if (!expected.includes(diagnostics?.[key])) {
		throw new Error(
			`${fixture} expected diagnostics.${key} in [${expected.join(', ')}], got ${JSON.stringify(diagnostics)}`,
		);
	}
}

function assertFixtureDiagnostics(fixture, diagnostics) {
	const expectedBase = EXPECTED_DIAGNOSTICS[fixture];
	if (!expectedBase) return;
	const expected = {...expectedBase};
	const apiOverride = diagnosticOverride('FLUXER_WIN_GAME_CAPTURE_EXPECT_API_TYPE', fixture);
	const transportOverride = diagnosticOverride('FLUXER_WIN_GAME_CAPTURE_EXPECT_TRANSPORT', fixture);
	const fallbackOverride = diagnosticOverride('FLUXER_WIN_GAME_CAPTURE_EXPECT_FALLBACK_REASON', fixture);
	if (apiOverride !== undefined) expected.apiType = apiOverride;
	if (transportOverride !== undefined) {
		expected.transport = transportOverride;
		delete expected.transportOneOf;
		expected.requiresDxgiFormat = expected.transport === TRANSPORT_SHARED_TEXTURE;
	}
	if (fallbackOverride !== undefined) {
		expected.fallbackReason = fallbackOverride;
		delete expected.fallbackReasonOneOf;
	}

	assertEqualDiagnostic(fixture, diagnostics, 'apiType', expected.apiType);
	if (expected.transportOneOf) {
		assertOneOfDiagnostic(fixture, diagnostics, 'transport', expected.transportOneOf);
	} else {
		assertEqualDiagnostic(fixture, diagnostics, 'transport', expected.transport);
	}
	if (expected.fallbackReason !== undefined) {
		assertEqualDiagnostic(fixture, diagnostics, 'fallbackReason', expected.fallbackReason);
	} else if (expected.fallbackReasonOneOf) {
		assertOneOfDiagnostic(fixture, diagnostics, 'fallbackReason', expected.fallbackReasonOneOf);
	}
	if (diagnostics?.activeStrategy !== 'game-hook') {
		throw new Error(`${fixture} expected activeStrategy=game-hook, got ${JSON.stringify(diagnostics)}`);
	}
	if (
		(expected.requiresDxgiFormat ||
			(expected.requiresDxgiFormatWhenShared && diagnostics?.transport === TRANSPORT_SHARED_TEXTURE)) &&
		Number(diagnostics?.dxgiFormat ?? 0) === 0
	) {
		throw new Error(`${fixture} expected a non-zero shared texture DXGI format, got ${JSON.stringify(diagnostics)}`);
	}
}

async function runFixture(fixture) {
	const exe = await buildFixture(fixture);
	const args = ['--frames', '900', '--width', String(WIDTH), '--height', String(HEIGHT), '--windowed'];
	if (fixture === 'vulkan-present-fixture') args.push('--resize-at', '120');
	args.push(...extraFixtureArgs(fixture));
	const child = spawn(exe, args, {
		cwd: dirname(exe),
		stdio: ['ignore', 'pipe', 'pipe'],
		windowsHide: false,
	});
	let started = false;
	try {
		const hwnd = await waitForHwnd(child, fixture);
		const screenCapture = new capture.ScreenCapture({
			sourceId: `window:${hwnd}:0`,
			sourceKind: 'game',
			width: WIDTH,
			height: HEIGHT,
			frameRate: FRAME_RATE,
			injectionMethod: process.env.FLUXER_WIN_GAME_CAPTURE_INJECTION_METHOD || 'auto',
		});
		let result;
		try {
			result = await screenCapture.start();
			started = true;
			const observed = await waitForAdvancingFrames(screenCapture, fixture);
			assertFixtureDiagnostics(fixture, observed.diagnostics);
			console.log(
				`[fixture-smoke] PASS ${fixture}: start=${JSON.stringify(result)} frames=${observed.frameCount} signatures=${observed.signatures} diagnostics=${JSON.stringify(observed.diagnostics)}`,
			);
		} finally {
			if (started) await screenCapture.stop().catch(() => {});
		}
	} finally {
		if (!child.killed) child.kill();
	}
}

async function main() {
	if (process.platform !== 'win32') {
		console.log('[fixture-smoke] SKIP: Windows game-capture fixtures only run on Windows');
		return 0;
	}
	if (!capture.isSupported()) {
		throw new Error(`win-game-capture binding unavailable: ${capture.loadError?.message ?? 'unknown error'}`);
	}
	for (const fixture of selectedFixtures()) {
		await runFixture(fixture);
	}
	return 0;
}

try {
	process.exitCode = await main();
} catch (error) {
	console.error(`[fixture-smoke] FAIL: ${error.stack ?? error.message}`);
	process.exitCode = 1;
}

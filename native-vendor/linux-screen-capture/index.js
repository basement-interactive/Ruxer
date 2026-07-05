// SPDX-License-Identifier: AGPL-3.0-or-later

const {EventEmitter} = require('node:events');
const {existsSync} = require('node:fs');
const {delimiter, join, sep} = require('node:path');
const {createNativeLoadError, loadNativeBinding} = require('./loader-diagnostics.cjs');
const MODULE_NAME = '@fluxer/linux-screen-capture';
const SKIP_NATIVE_PROBE_ENV = 'FLUXER_LINUX_SCREEN_CAPTURE_SKIP_NATIVE_PROBE';
const OBS_VKCAPTURE_LAYER_NAME = 'VK_LAYER_OBS_vkcapture_64';
const DEFAULT_NVIDIA_VULKAN_ICD = '/usr/share/vulkan/icd.d/nvidia_icd.json';

function resolveNativeRoot() {
	const asarSegment = `${sep}app.asar${sep}`;
	if (!__dirname.includes(asarSegment)) return __dirname;
	const unpackedDir = __dirname.replace(asarSegment, `${sep}app.asar.unpacked${sep}`);
	return existsSync(unpackedDir) ? unpackedDir : __dirname;
}

function nativeFileName() {
	if (process.platform !== 'linux') {
		throw new Error(`@fluxer/linux-screen-capture is only supported on Linux, got ${process.platform}`);
	}
	switch (process.arch) {
		case 'x64':
			return 'linux-screen-capture.linux-x64-gnu.node';
		case 'arm64':
			return 'linux-screen-capture.linux-arm64-gnu.node';
		default:
			throw new Error(`Unsupported Linux architecture: ${process.arch}`);
	}
}

let binding = null;
let loadError = null;

if (process.platform === 'linux') {
	try {
		const nativeRoot = resolveNativeRoot();
		const nativePath = join(nativeRoot, nativeFileName());
		const loaded = loadNativeBinding({
			moduleName: MODULE_NAME,
			nativePath,
			nativeRoot,
			packageDir: __dirname,
			skipNativeProbeEnv: SKIP_NATIVE_PROBE_ENV,
		});
		binding = loaded.binding;
		loadError = loaded.loadError;
		if (loadError) throw loadError;
	} catch (error) {
		loadError = createNativeLoadError({
			moduleName: MODULE_NAME,
			nativeRoot: resolveNativeRoot(),
			packageDir: __dirname,
			reason: 'native loader threw before binding load completed',
			cause: error,
			skipNativeProbeEnv: SKIP_NATIVE_PROBE_ENV,
		});
		throw loadError;
	}
}

function getBackendInfo() {
	if (!binding) {
		return {
			backend: 'linux-pipewire-portal',
			supported: false,
			reason:
				process.platform === 'linux'
					? `@fluxer/linux-screen-capture native binary unavailable: ${loadError?.message ?? 'unknown reason'}`
					: `@fluxer/linux-screen-capture is only supported on Linux, got ${process.platform}`,
			portalVersion: undefined,
			pipewireReachable: false,
		};
	}
	return binding.getBackendInfo();
}

function getAvailability() {
	if (!binding) {
		return Promise.resolve({
			available: false,
			backend: 'linux-pipewire-portal',
			reason: 'unsupported-platform',
			capabilities: {process: false, system: false},
		});
	}
	return binding.getAvailability();
}

function listSources() {
	if (!binding) return Promise.resolve([]);
	return binding.listSources();
}

function prependPathEnv(current, next) {
	if (!next) return current;
	if (!current) return next;
	const parts = current.split(delimiter).filter(Boolean);
	return parts.includes(next) ? current : `${next}${delimiter}${current}`;
}

function appendColonEnv(current, next) {
	if (!next) return current;
	if (!current) return next;
	const parts = current.split(':').filter(Boolean);
	return parts.includes(next) ? current : `${current}:${next}`;
}

function bundledObsVkcaptureRoots(nativeRoot) {
	return [join(nativeRoot, 'obs-vkcapture'), join(nativeRoot, 'game-capture', 'obs-vkcapture')];
}

function resolveBundledVulkanLayerDir(nativeRoot) {
	for (const root of bundledObsVkcaptureRoots(nativeRoot)) {
		const jsonPath = join(root, 'obs_vkcapture_64.json');
		const layerPath = join(root, 'libVkLayer_obs_vkcapture.so');
		if (existsSync(jsonPath) && existsSync(layerPath)) return root;
		const vulkanRoot = join(root, 'vulkan');
		const vulkanJsonPath = join(vulkanRoot, 'obs_vkcapture_64.json');
		const vulkanLayerPath = join(vulkanRoot, 'libVkLayer_obs_vkcapture.so');
		if (existsSync(vulkanJsonPath) && existsSync(vulkanLayerPath)) return vulkanRoot;
	}
	return null;
}

function resolveBundledGlCaptureLib(nativeRoot) {
	for (const root of bundledObsVkcaptureRoots(nativeRoot)) {
		const candidates = [
			join(root, 'obs_glcapture', 'libobs_glcapture.so'),
			join(root, 'opengl', 'libobs_glcapture.so'),
			join(root, 'libobs_glcapture.so'),
		];
		for (const candidate of candidates) {
			if (existsSync(candidate)) return candidate;
		}
	}
	return null;
}

function resolveSystemVulkanLayerManifest() {
	const candidates = [
		'/usr/share/vulkan/implicit_layer.d/obs_vkcapture_64.json',
		'/usr/local/share/vulkan/implicit_layer.d/obs_vkcapture_64.json',
	];
	return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function resolveSystemGlCaptureLib() {
	const candidates = [
		'/usr/lib/obs_glcapture/libobs_glcapture.so',
		'/usr/lib64/obs_glcapture/libobs_glcapture.so',
		'/usr/local/lib/obs_glcapture/libobs_glcapture.so',
		'/usr/lib/x86_64-linux-gnu/obs_glcapture/libobs_glcapture.so',
		'/usr/lib/aarch64-linux-gnu/obs_glcapture/libobs_glcapture.so',
	];
	return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function resolveNvidiaIcdPath(forceNvidiaIcd) {
	if (typeof forceNvidiaIcd === 'string' && forceNvidiaIcd.length > 0) return forceNvidiaIcd;
	if (forceNvidiaIcd !== true) return null;
	return existsSync(DEFAULT_NVIDIA_VULKAN_ICD) ? DEFAULT_NVIDIA_VULKAN_ICD : null;
}

function addDiscreteGpuLaunchEnv(env, options = {}) {
	env.DRI_PRIME = env.DRI_PRIME || '1';
	env.__NV_PRIME_RENDER_OFFLOAD = '1';
	env.__VK_LAYER_NV_optimus = 'NVIDIA_only';
	env.__GLX_VENDOR_LIBRARY_NAME = 'nvidia';
	const nvidiaIcdPath = resolveNvidiaIcdPath(options.forceNvidiaIcd);
	if (nvidiaIcdPath) env.VK_ICD_FILENAMES = nvidiaIcdPath;
	return nvidiaIcdPath;
}

function getGameCaptureLaunchEnvironment(options = {}) {
	const baseEnv = options.env ?? process.env;
	const nativeRoot = options.nativeRoot ?? resolveNativeRoot();
	const mode = options.mode === 'vulkan' || options.mode === 'opengl' ? options.mode : 'auto';
	const env = {...baseEnv, OBS_VKCAPTURE: '1'};
	if (options.name) env.OBS_VKCAPTURE_NAME = String(options.name);
	const nvidiaIcdPath = options.preferDiscreteGpu ? addDiscreteGpuLaunchEnv(env, options) : null;

	const bundledVulkanLayerDir = resolveBundledVulkanLayerDir(nativeRoot);
	const systemVulkanLayerManifest = resolveSystemVulkanLayerManifest();
	if (mode !== 'opengl' && bundledVulkanLayerDir) {
		env.VK_ADD_LAYER_PATH = prependPathEnv(env.VK_ADD_LAYER_PATH, bundledVulkanLayerDir);
		env.VK_INSTANCE_LAYERS = appendColonEnv(env.VK_INSTANCE_LAYERS, OBS_VKCAPTURE_LAYER_NAME);
	}

	const bundledGlCaptureLib = resolveBundledGlCaptureLib(nativeRoot);
	const systemGlCaptureLib = resolveSystemGlCaptureLib();
	const glCaptureLib = bundledGlCaptureLib ?? systemGlCaptureLib;
	if (mode !== 'vulkan' && glCaptureLib) {
		env.LD_PRELOAD = appendColonEnv(env.LD_PRELOAD, glCaptureLib);
	}

	return {
		env,
		diagnostics: {
			mode,
			preferDiscreteGpu: options.preferDiscreteGpu === true,
			forceNvidiaIcd: options.forceNvidiaIcd === true || typeof options.forceNvidiaIcd === 'string',
			nvidiaIcdPath,
			bundledVulkanLayerDir,
			systemVulkanLayerManifest,
			vulkanLayerName: bundledVulkanLayerDir ? OBS_VKCAPTURE_LAYER_NAME : null,
			bundledGlCaptureLib,
			systemGlCaptureLib,
			glCaptureLib,
			licenseBoundary:
				'obs-vkcapture hook assets are separate GPL-covered runtime tools; Fluxer communicates through the OBS-compatible socket protocol.',
		},
	};
}

function __setBindingForTests(nextBinding) {
	binding = nextBinding;
	loadError = null;
}

class ScreenCapture extends EventEmitter {
	constructor(options = {}) {
		super();
		if (!binding) {
			throw loadError || new Error('@fluxer/linux-screen-capture binding unavailable');
		}
		this.sourceId = options.sourceId;
		this.sourceKind = options.sourceKind ?? 'screen';
		this.width = options.width ?? 0;
		this.height = options.height ?? 0;
		this.frameRate = options.frameRate ?? 30;
		this.captureId = typeof options.captureId === 'string' ? options.captureId : undefined;
		this.colorRange = options.colorRange;
		this.colorSpace = options.colorSpace;
		this.showCursorClicks = options.showCursorClicks === true;
		this.captureRect = options.captureRect;
		this.frameSinkHandle = options.frameSinkHandle;
		this.nativeFrameSinkRequired = options.nativeFrameSinkRequired === true;
		this.started = false;
		this.stopped = false;
		this.closedEmitted = false;
		this.native = new binding.ScreenCapture();
		this.native.setLifecycleCallback((type, message) => {
			if (type === 'error') {
				this.emit('error', new Error(message || 'Linux PipeWire screen capture stream stopped'));
				return;
			}
			if (type === 'closed' || type === 'closed-clean') {
				if (this.stopped) {
					this.emitClosedOnce();
					return;
				}
				this.stopped = true;
				Promise.resolve()
					.then(() => this.native.stop())
					.catch(() => {});
				this.emitClosedOnce();
				return;
			}
			if (type === 'stalled' || type === 'diagnostic') {
				this.emit(type, message);
			}
		});
	}

	emitClosedOnce() {
		if (this.closedEmitted) return;
		this.closedEmitted = true;
		this.emit('closed');
	}

	async start() {
		if (this.started || this.stopped) return;
		this.started = true;
		try {
			if (this.frameSinkHandle != null) {
				if (typeof this.native.setFrameSinkHandle !== 'function') {
					throw new Error('@fluxer/linux-screen-capture native binding does not support frame sink handles');
				}
				this.native.setFrameSinkHandle(this.frameSinkHandle);
			} else if (this.nativeFrameSinkRequired) {
				throw new Error('@fluxer/linux-screen-capture native frame sink handle is required');
			}
			const result = await this.native.start(
				String(this.sourceId ?? ''),
				this.sourceKind,
				this.width,
				this.height,
				this.frameRate,
				this.captureId,
				{
					colorRange: this.colorRange,
					colorSpace: this.colorSpace,
					showCursorClicks: this.showCursorClicks,
					captureRect: this.captureRect,
				},
			);
			if (result) {
				this.width = result.width ?? this.width;
				this.height = result.height ?? this.height;
				this.frameRate = result.frameRate ?? this.frameRate;
				this.pixelFormat = result.pixelFormat ?? 'nv12';
			}
			return {
				width: this.width,
				height: this.height,
				frameRate: this.frameRate,
				pixelFormat: this.pixelFormat ?? 'nv12',
			};
		} catch (error) {
			this.stopped = true;
			this.emit('error', error instanceof Error ? error : new Error(String(error)));
			throw error;
		}
	}

	async stop() {
		if (this.stopped) return;
		this.stopped = true;
		try {
			await this.native.stop();
		} finally {
			this.emitClosedOnce();
		}
	}

	getDiagnostics() {
		const addonDiagnostics = typeof this.native.getDiagnostics === 'function' ? this.native.getDiagnostics() : null;
		if (!addonDiagnostics) return null;
		return {
			...addonDiagnostics,
			sourceId: String(this.sourceId ?? ''),
			sourceKind: this.sourceKind,
			width: addonDiagnostics.width ?? this.width,
			height: addonDiagnostics.height ?? this.height,
		};
	}
}

module.exports = {
	ScreenCapture,
	getAvailability,
	getBackendInfo,
	getGameCaptureLaunchEnvironment,
	listSources,
	loadError,
	__setBindingForTests,
};

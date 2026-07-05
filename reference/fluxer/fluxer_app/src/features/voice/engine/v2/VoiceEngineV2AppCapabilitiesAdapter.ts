// SPDX-License-Identifier: AGPL-3.0-or-later

import {
	type CapabilitiesPort,
	normalizeVoiceEngineV2HardwareEncoderCapabilities,
	unavailableVoiceEngineV2HardwareEncoderCapabilities,
	type VoiceEngineV2HardwareEncoderCapabilities,
} from '@fluxer/voice_engine_v2';

export interface VoiceEngineV2NativeCapabilitiesBinding {
	getHardwareEncoderCapabilities(): Promise<unknown> | unknown;
}

export interface VoiceEngineV2AppCapabilitiesAdapterOptions {
	binding?: VoiceEngineV2NativeCapabilitiesBinding | null;
}

export class VoiceEngineV2AppCapabilitiesAdapter implements CapabilitiesPort {
	private readonly binding: VoiceEngineV2NativeCapabilitiesBinding | null;

	constructor(options: VoiceEngineV2AppCapabilitiesAdapterOptions = {}) {
		const binding = options.binding ?? null;
		this.binding = isViableBinding(binding) ? binding : null;
		if (this.binding !== null) {
			if (typeof this.binding.getHardwareEncoderCapabilities !== 'function') {
				throw new Error('VoiceEngineV2AppCapabilitiesAdapter: binding rejected after viability check');
			}
		}
	}

	async getHardwareEncoderCapabilities(): Promise<VoiceEngineV2HardwareEncoderCapabilities> {
		const binding = this.binding;
		if (binding === null) {
			const fallback = unavailableVoiceEngineV2HardwareEncoderCapabilities('not-compiled');
			assertCapabilityShape(fallback);
			return fallback;
		}
		try {
			const raw = await Promise.resolve(binding.getHardwareEncoderCapabilities());
			const normalized = normalizeVoiceEngineV2HardwareEncoderCapabilities(raw);
			assertCapabilityShape(normalized);
			return normalized;
		} catch {
			const fallback = unavailableVoiceEngineV2HardwareEncoderCapabilities('no-runtime');
			assertCapabilityShape(fallback);
			return fallback;
		}
	}
}

function isViableBinding(
	binding: VoiceEngineV2NativeCapabilitiesBinding | null | undefined,
): binding is VoiceEngineV2NativeCapabilitiesBinding {
	if (binding === null || binding === undefined) return false;
	return typeof binding.getHardwareEncoderCapabilities === 'function';
}

function assertCapabilityShape(value: VoiceEngineV2HardwareEncoderCapabilities): void {
	if (typeof value !== 'object' || value === null) {
		throw new Error('VoiceEngineV2AppCapabilitiesAdapter: capability is not an object');
	}
	if (typeof value.available !== 'boolean') {
		throw new Error('VoiceEngineV2AppCapabilitiesAdapter: capability.available is not boolean');
	}
	if (typeof value.backend !== 'string' || value.backend.length === 0) {
		throw new Error('VoiceEngineV2AppCapabilitiesAdapter: capability.backend is not a non-empty string');
	}
	if (!Array.isArray(value.codecs)) {
		throw new Error('VoiceEngineV2AppCapabilitiesAdapter: capability.codecs is not an array');
	}
	if (!Array.isArray(value.nativeInputs)) {
		throw new Error('VoiceEngineV2AppCapabilitiesAdapter: capability.nativeInputs is not an array');
	}
	if (typeof value.zeroCopy !== 'boolean') {
		throw new Error('VoiceEngineV2AppCapabilitiesAdapter: capability.zeroCopy is not boolean');
	}
}

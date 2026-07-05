// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from 'node:assert/strict';
import type {VoiceEngineV2CodecGossipMessage, VoiceEngineV2VideoCodec} from './types';

export const VOICE_ENGINE_V2_CODEC_GOSSIP_TOPIC = 'fluxer.codec.v1';

const KNOWN_VIDEO_CODECS: ReadonlySet<string> = new Set(['', 'vp8', 'vp9', 'h264', 'h265', 'av1']);
const VIDEO_CODECS_CAP = 8;

function isVideoCodec(value: unknown): value is VoiceEngineV2VideoCodec {
	return typeof value === 'string' && KNOWN_VIDEO_CODECS.has(value);
}

function normalizeSupportedVideoCodecs(value: unknown): Array<VoiceEngineV2VideoCodec> | null {
	if (!Array.isArray(value)) return null;
	if (value.length > VIDEO_CODECS_CAP) return null;
	const codecs: Array<VoiceEngineV2VideoCodec> = [];
	for (const entry of value) {
		if (!isVideoCodec(entry)) return null;
		codecs.push(entry);
	}
	return codecs;
}

export function encodeVoiceEngineV2CodecGossip(message: VoiceEngineV2CodecGossipMessage): Uint8Array {
	assert.ok(message != null, 'encodeVoiceEngineV2CodecGossip message must not be null');
	assert.ok(message.kind === 'codec.capability' || message.kind === 'codec.viewing', 'unknown gossip message kind');
	return new TextEncoder().encode(JSON.stringify(message));
}

export function decodeVoiceEngineV2CodecGossip(
	payload: ArrayBuffer | ArrayBufferView | string,
): VoiceEngineV2CodecGossipMessage | null {
	const text = typeof payload === 'string' ? payload : decodeUtf8(payload);
	if (text === null) return null;
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		return null;
	}
	if (typeof parsed !== 'object' || parsed === null) return null;
	const candidate = parsed as Record<string, unknown>;
	if (candidate.kind === 'codec.capability') {
		const supportedVideoCodecs = normalizeSupportedVideoCodecs(candidate.supportedVideoCodecs);
		if (supportedVideoCodecs === null) return null;
		return {kind: 'codec.capability', supportedVideoCodecs};
	}
	if (candidate.kind === 'codec.viewing') {
		if (candidate.source !== 'camera' && candidate.source !== 'screen') return null;
		if (typeof candidate.watching !== 'boolean') return null;
		const supportedVideoCodecs = normalizeSupportedVideoCodecs(candidate.supportedVideoCodecs);
		if (supportedVideoCodecs === null) return null;
		return {
			kind: 'codec.viewing',
			source: candidate.source,
			watching: candidate.watching,
			supportedVideoCodecs,
		};
	}
	return null;
}

function decodeUtf8(payload: ArrayBuffer | ArrayBufferView): string | null {
	try {
		const view =
			payload instanceof ArrayBuffer
				? new Uint8Array(payload)
				: new Uint8Array(payload.buffer, payload.byteOffset, payload.byteLength);
		return new TextDecoder('utf-8', {fatal: false}).decode(view);
	} catch {
		return null;
	}
}

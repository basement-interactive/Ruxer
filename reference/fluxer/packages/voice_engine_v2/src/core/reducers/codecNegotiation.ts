// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from 'node:assert/strict';
import {
	maxDecodableVoiceEngineV2VideoCodec,
	planVoiceEngineV2NegotiatedVideoCodec,
	type VoiceEngineV2CodecViewer,
} from '../../policies/codecNegotiation';
import type {VoiceEngineV2Event} from '../../protocol/events';
import type {
	VoiceEngineV2CodecStreamNegotiation,
	VoiceEngineV2LocalStreamSource,
	VoiceEngineV2VideoCodec,
} from '../../protocol/types';
import type {VoiceEngineV2Snapshot, VoiceEngineV2Transition} from '../state';
import {beginCameraEncodingUpdate} from './camera';
import {beginScreenEncodingUpdate} from './screen';

type VoiceEngineV2CodecNegotiationEvent = Extract<VoiceEngineV2Event, {type: `codecNegotiation.${string}`}>;

function publishedCodecForSource(
	snapshot: VoiceEngineV2Snapshot,
	source: VoiceEngineV2LocalStreamSource,
): VoiceEngineV2VideoCodec | null {
	const media = source === 'camera' ? snapshot.camera : snapshot.screen;
	if (media.status !== 'published') return null;
	return media.published?.codec ?? null;
}

function viewersForPolicy(stream: VoiceEngineV2CodecStreamNegotiation): Array<VoiceEngineV2CodecViewer> {
	const viewers: Array<VoiceEngineV2CodecViewer> = [];
	for (const identity of Object.keys(stream.viewers).sort()) {
		viewers.push({identity, maxVideoCodec: stream.viewers[identity] ?? null});
	}
	return viewers;
}

function setStream(
	snapshot: VoiceEngineV2Snapshot,
	source: VoiceEngineV2LocalStreamSource,
	stream: VoiceEngineV2CodecStreamNegotiation,
): VoiceEngineV2Snapshot {
	return {
		...snapshot,
		codecNegotiation: {
			...snapshot.codecNegotiation,
			streams: {...snapshot.codecNegotiation.streams, [source]: stream},
		},
	};
}

function recomputeStream(
	snapshot: VoiceEngineV2Snapshot,
	source: VoiceEngineV2LocalStreamSource,
): VoiceEngineV2Transition {
	assert.ok(snapshot != null, 'recomputeStream snapshot must not be null');
	const existing = snapshot.codecNegotiation.streams[source];
	if (!existing) return {snapshot, commands: []};
	const preferred = snapshot.codecNegotiation.overrides[source] ?? existing.preferredCodec;
	const plan = planVoiceEngineV2NegotiatedVideoCodec({preferred, viewers: viewersForPolicy(existing)});
	const updatedStream: VoiceEngineV2CodecStreamNegotiation = {
		...existing,
		negotiatedCodec: plan.codec,
		constrainedBy: plan.constrainedBy,
	};
	const withStream = setStream(snapshot, source, updatedStream);
	const publishedCodec = publishedCodecForSource(withStream, source);
	if (publishedCodec === null) return {snapshot: withStream, commands: []};
	if (publishedCodec === plan.codec) return {snapshot: withStream, commands: []};
	if (source === 'camera') {
		return beginCameraEncodingUpdate(withStream, {codec: plan.codec});
	}
	const published = withStream.screen.published;
	assert.ok(published != null, 'recomputeStream screen republish requires a published screen');
	return beginScreenEncodingUpdate(withStream, {
		captureId: published.captureId,
		width: published.width,
		height: published.height,
		codec: plan.codec,
	});
}

function applyViewerChanged(
	snapshot: VoiceEngineV2Snapshot,
	source: VoiceEngineV2LocalStreamSource,
	viewerIdentity: string,
	watching: boolean,
	supportedVideoCodecs: Array<VoiceEngineV2VideoCodec>,
): VoiceEngineV2Transition {
	assert.equal(typeof viewerIdentity, 'string', 'applyViewerChanged viewerIdentity must be a string');
	assert.ok(viewerIdentity.length > 0, 'applyViewerChanged viewerIdentity must not be empty');
	const existing = snapshot.codecNegotiation.streams[source];
	if (!existing) return {snapshot, commands: []};
	const viewers = {...existing.viewers};
	if (watching) {
		viewers[viewerIdentity] = maxDecodableVoiceEngineV2VideoCodec(supportedVideoCodecs);
	} else {
		delete viewers[viewerIdentity];
	}
	const withViewers = setStream(snapshot, source, {...existing, viewers});
	return recomputeStream(withViewers, source);
}

function registerStream(
	snapshot: VoiceEngineV2Snapshot,
	source: VoiceEngineV2LocalStreamSource,
	streamIdentity: string,
	preferredCodec: VoiceEngineV2VideoCodec,
): VoiceEngineV2Transition {
	assert.equal(typeof streamIdentity, 'string', 'registerStream streamIdentity must be a string');
	assert.ok(streamIdentity.length > 0, 'registerStream streamIdentity must not be empty');
	const existing = snapshot.codecNegotiation.streams[source];
	const stream: VoiceEngineV2CodecStreamNegotiation = {
		source,
		streamIdentity,
		preferredCodec,
		negotiatedCodec: existing?.negotiatedCodec ?? preferredCodec,
		constrainedBy: existing?.constrainedBy ?? null,
		viewers: existing?.viewers ?? {},
	};
	return recomputeStream(setStream(snapshot, source, stream), source);
}

function unregisterStream(
	snapshot: VoiceEngineV2Snapshot,
	source: VoiceEngineV2LocalStreamSource,
): VoiceEngineV2Transition {
	if (!snapshot.codecNegotiation.streams[source]) return {snapshot, commands: []};
	const streams = {...snapshot.codecNegotiation.streams};
	delete streams[source];
	return {snapshot: {...snapshot, codecNegotiation: {...snapshot.codecNegotiation, streams}}, commands: []};
}

export function transitionCodecNegotiation(
	snapshot: VoiceEngineV2Snapshot,
	event: VoiceEngineV2CodecNegotiationEvent,
): VoiceEngineV2Transition {
	assert.ok(snapshot != null, 'transitionCodecNegotiation snapshot must not be null');
	assert.ok(event != null, 'transitionCodecNegotiation event must not be null');
	assert.ok(event.type.startsWith('codecNegotiation.'), 'codecNegotiation reducer received unrelated event');
	switch (event.type) {
		case 'codecNegotiation.overrideSetRequested': {
			const overrides = {...snapshot.codecNegotiation.overrides};
			if (event.codec === null || event.codec === '') {
				delete overrides[event.source];
			} else {
				overrides[event.source] = event.codec;
			}
			const withOverride = {...snapshot, codecNegotiation: {...snapshot.codecNegotiation, overrides}};
			return recomputeStream(withOverride, event.source);
		}
		case 'codecNegotiation.localCapabilityChanged':
			return {
				snapshot: {
					...snapshot,
					codecNegotiation: {...snapshot.codecNegotiation, localSupportedVideoCodecs: [...event.supportedVideoCodecs]},
				},
				commands: [],
			};
		case 'codecNegotiation.remoteCapabilityChanged':
			return {
				snapshot: {
					...snapshot,
					codecNegotiation: {
						...snapshot.codecNegotiation,
						remoteSupportedVideoCodecs: {
							...snapshot.codecNegotiation.remoteSupportedVideoCodecs,
							[event.identity]: [...event.supportedVideoCodecs],
						},
					},
				},
				commands: [],
			};
		case 'codecNegotiation.streamRegistered':
			return registerStream(snapshot, event.source, event.streamIdentity, event.preferredCodec);
		case 'codecNegotiation.streamUnregistered':
			return unregisterStream(snapshot, event.source);
		case 'codecNegotiation.viewerChanged':
			return applyViewerChanged(
				snapshot,
				event.source,
				event.viewerIdentity,
				event.watching,
				event.supportedVideoCodecs,
			);
	}
}

// SPDX-License-Identifier: AGPL-3.0-or-later

import {
	selectVoiceMediaGraphAttempt,
	selectVoiceMediaGraphFailure,
	selectVoiceMediaGraphSubscriptionEntry,
	type VoiceMediaGraphSnapshot,
	type VoiceMediaGraphSubscriptionEntry,
} from './VoiceMediaGraph';
import type {VoiceTrackSource} from './VoiceTrackSource';

export type VoiceMediaGraphStreamTileState =
	| 'idle'
	| 'watchDesired'
	| 'publicationMissing'
	| 'attaching'
	| 'subscribedAwaitingFrame'
	| 'rendering'
	| 'failed';

export interface VoiceMediaGraphStreamTileTarget {
	streamKey: string | null;
	participantIdentity: string | null;
	source: VoiceTrackSource;
}

function tileHasFailure(snapshot: VoiceMediaGraphSnapshot, target: VoiceMediaGraphStreamTileTarget): boolean {
	if (!target.streamKey && !target.participantIdentity) return false;
	const failure = selectVoiceMediaGraphFailure(snapshot, {
		streamKey: target.streamKey,
		participantIdentity: target.participantIdentity,
		source: target.source,
	});
	return failure !== null;
}

function tileIsRendering(
	snapshot: VoiceMediaGraphSnapshot,
	target: VoiceMediaGraphStreamTileTarget,
	entry: VoiceMediaGraphSubscriptionEntry | null,
): boolean {
	if (entry !== null && entry.firstFrame.renderedAt !== null) return true;
	if (!target.streamKey) return false;
	const attempt = selectVoiceMediaGraphAttempt(snapshot, target.streamKey);
	return attempt?.hasRenderedVideoFrame ?? false;
}

export function selectVoiceMediaGraphStreamTileState(
	snapshot: VoiceMediaGraphSnapshot,
	target: VoiceMediaGraphStreamTileTarget,
): VoiceMediaGraphStreamTileState {
	const entry = target.participantIdentity
		? selectVoiceMediaGraphSubscriptionEntry(snapshot, target.participantIdentity, target.source)
		: null;
	if (tileHasFailure(snapshot, target)) return 'failed';
	if (tileIsRendering(snapshot, target, entry)) return 'rendering';
	if (entry?.actual.lastError) return 'failed';
	if (entry?.actual.subscribed === true) return 'subscribedAwaitingFrame';
	if (entry?.publication.available) return 'attaching';
	if (entry) return 'publicationMissing';
	if (target.streamKey && snapshot.watchIntent.viewerStreamKeys.includes(target.streamKey)) return 'watchDesired';
	return 'idle';
}

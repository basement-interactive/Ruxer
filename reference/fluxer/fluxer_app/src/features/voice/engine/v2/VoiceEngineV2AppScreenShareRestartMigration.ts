// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from 'node:assert/strict';
import ScreenSharePublicationMigration from '@app/features/voice/engine/ScreenSharePublicationMigration';
import {getPreferredScreenShareCodec, logger} from '@app/features/voice/engine/voice_screen_share_manager/shared';
import {type LocalParticipant, type Room, Track, type TrackPublishOptions, type VideoCodec} from 'livekit-client';

export interface ScreenShareRestartMigrationSession {
	readonly migrationId: string;
	readonly generation: number;
	readonly participantIdentity: string;
	readonly previousTrackSid: string | null;
	readonly candidateTrackSid: string;
}

function isVideoCodecValue(value: unknown): value is VideoCodec {
	return value === 'av1' || value === 'h265' || value === 'h264' || value === 'vp9' || value === 'vp8';
}

export function resolveScreenShareRestartMigrationCodec(
	nextPublishOptions: TrackPublishOptions | undefined,
	previousPublishOptions: TrackPublishOptions | undefined,
): VideoCodec {
	const nextCodec = nextPublishOptions?.videoCodec;
	if (isVideoCodecValue(nextCodec)) return nextCodec;
	const previousCodec = previousPublishOptions?.videoCodec;
	if (isVideoCodecValue(previousCodec)) return previousCodec;
	return getPreferredScreenShareCodec();
}

function getPreviousScreenShareTrackSid(participant: LocalParticipant): string | null {
	assert.ok(participant, 'participant is required');
	const publication = participant.getTrackPublication(Track.Source.ScreenShare);
	if (typeof publication?.trackSid === 'string' && publication.trackSid.length > 0) return publication.trackSid;
	for (const candidate of participant.trackPublications.values()) {
		if (candidate.source !== Track.Source.ScreenShare) continue;
		if (typeof candidate.trackSid === 'string' && candidate.trackSid.length > 0) return candidate.trackSid;
	}
	return null;
}

export async function announceScreenShareRestartMigration(args: {
	readonly room: Room | null;
	readonly generation: number;
	readonly previousPublishOptions: TrackPublishOptions | undefined;
	readonly nextPublishOptions: TrackPublishOptions | undefined;
	readonly candidateTrackSid: string;
	readonly reason: string;
}): Promise<ScreenShareRestartMigrationSession | null> {
	assert.ok(args.room === null || typeof args.room === 'object');
	assert.ok(Number.isInteger(args.generation) && args.generation > 0);
	assert.ok(args.candidateTrackSid.length > 0, 'candidateTrackSid is required');
	assert.ok(args.reason.length > 0, 'reason is required');
	const participant = args.room?.localParticipant;
	if (!participant) return null;
	const previousTrackSid = getPreviousScreenShareTrackSid(participant);
	const migrationId = ScreenSharePublicationMigration.createMigrationId();
	const codec = resolveScreenShareRestartMigrationCodec(args.nextPublishOptions, args.previousPublishOptions);
	const breakMessage = {
		migration_id: migrationId,
		generation: args.generation,
		previous_track_sid: previousTrackSid,
		codec,
		reason: args.reason,
	};
	ScreenSharePublicationMigration.markLocalMigrationBreaking(participant.identity, breakMessage);
	await ScreenSharePublicationMigration.publishBreak(args.room, {
		migrationId,
		generation: args.generation,
		previousTrackSid,
		codec,
		reason: args.reason,
	}).catch((error) => {
		logger.warn('Failed to publish native screen-share restart migration break', {error, migrationId});
	});
	return {
		migrationId,
		generation: args.generation,
		participantIdentity: participant.identity,
		previousTrackSid,
		candidateTrackSid: args.candidateTrackSid,
	};
}

export async function commitScreenShareRestartMigration(
	room: Room | null,
	session: ScreenShareRestartMigrationSession | null,
	candidateTrackSid: string,
): Promise<void> {
	if (!session || !room?.localParticipant) return;
	assert.ok(candidateTrackSid.length > 0, 'candidateTrackSid is required');
	const commitMessage = {
		migration_id: session.migrationId,
		generation: session.generation,
		previous_track_sid: session.previousTrackSid,
		candidate_track_sid: candidateTrackSid,
	};
	await ScreenSharePublicationMigration.publishCommit(room, commitMessage).catch((error) => {
		logger.warn('Failed to publish native screen-share restart migration commit', {
			error,
			migrationId: session.migrationId,
			candidateTrackSid,
		});
	});
	ScreenSharePublicationMigration.markLocalMigrationCommitted(session.participantIdentity, commitMessage);
}

export async function abortScreenShareRestartMigration(
	room: Room | null,
	session: ScreenShareRestartMigrationSession | null,
	reason: string,
): Promise<void> {
	if (!session || !room?.localParticipant) return;
	assert.ok(reason.length > 0, 'reason is required');
	const abortMessage = {
		migration_id: session.migrationId,
		generation: session.generation,
		candidate_track_sid: null,
		reason,
	};
	await ScreenSharePublicationMigration.publishAbort(room, abortMessage).catch((error) => {
		logger.warn('Failed to publish native screen-share restart migration abort', {
			error,
			migrationId: session.migrationId,
		});
	});
	ScreenSharePublicationMigration.markLocalMigrationAborted(session.participantIdentity, abortMessage);
}

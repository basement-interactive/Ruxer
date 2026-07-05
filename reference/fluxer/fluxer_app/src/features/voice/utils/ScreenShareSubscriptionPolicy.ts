// SPDX-License-Identifier: AGPL-3.0-or-later

import {VideoQuality} from 'livekit-client';

export interface ScreenSharePublicationTarget {
	isEnabled?: boolean;
	isDesired?: boolean;
	isSubscribed?: boolean;
	setEnabled?: (enabled: boolean) => void;
	setSubscribed?: (subscribed: boolean) => void;
	setVideoQuality?: (quality: VideoQuality) => void;
	emitTrackUpdate?: () => void;
}

export type ScreenSharePublicationOperation = 'setEnabled' | 'setSubscribed' | 'setVideoQuality' | 'emitTrackUpdate';
export type ScreenSharePublicationErrorHandler = (
	operation: ScreenSharePublicationOperation,
	label: string,
	error: unknown,
) => void;

export interface SyncScreenSharePublicationOptions {
	publication: ScreenSharePublicationTarget | null | undefined;
	label: string;
	shouldSubscribe: boolean;
	shouldEnable?: boolean;
	videoQuality?: VideoQuality;
	onError?: ScreenSharePublicationErrorHandler;
}

export interface SyncWatchedScreenSharePublicationsOptions {
	isScreenShare: boolean;
	isOwnScreenShare: boolean;
	userWantsToWatch: boolean;
	videoLocallyDisabled: boolean;
	audioEnabled: boolean;
	videoPublication?: ScreenSharePublicationTarget | null;
	audioPublication?: ScreenSharePublicationTarget | null;
	onError?: ScreenSharePublicationErrorHandler;
}

function setPublicationEnabled(
	publication: ScreenSharePublicationTarget,
	label: string,
	enabled: boolean,
	forceTrackSettingsUpdate: boolean,
	onError?: ScreenSharePublicationErrorHandler,
): void {
	if (typeof publication.setEnabled !== 'function') return;
	if (publication.isEnabled !== enabled) {
		try {
			publication.setEnabled(enabled);
		} catch (error) {
			onError?.('setEnabled', label, error);
		}
		return;
	}
	if (!forceTrackSettingsUpdate) return;
	if (typeof publication.emitTrackUpdate === 'function') {
		try {
			publication.emitTrackUpdate();
		} catch (error) {
			onError?.('emitTrackUpdate', label, error);
		}
		return;
	}
	try {
		publication.setEnabled(!enabled);
	} catch (error) {
		onError?.('setEnabled', label, error);
	}
	try {
		publication.setEnabled(enabled);
	} catch (error) {
		onError?.('setEnabled', label, error);
	}
}

function setPublicationSubscribed(
	publication: ScreenSharePublicationTarget,
	label: string,
	subscribed: boolean,
	onError?: ScreenSharePublicationErrorHandler,
): void {
	if (typeof publication.setSubscribed !== 'function') return;
	try {
		publication.setSubscribed(subscribed);
	} catch (error) {
		onError?.('setSubscribed', label, error);
	}
}

function setPublicationVideoQuality(
	publication: ScreenSharePublicationTarget,
	label: string,
	videoQuality: VideoQuality | undefined,
	onError?: ScreenSharePublicationErrorHandler,
): void {
	if (videoQuality === undefined || typeof publication.setVideoQuality !== 'function') return;
	try {
		publication.setVideoQuality(videoQuality);
	} catch (error) {
		onError?.('setVideoQuality', label, error);
	}
}

export function syncScreenSharePublication({
	publication,
	label,
	shouldSubscribe,
	shouldEnable = shouldSubscribe,
	videoQuality,
	onError,
}: SyncScreenSharePublicationOptions): void {
	if (!publication) return;
	const desired = publication.isDesired ?? publication.isSubscribed ?? false;
	if (!shouldSubscribe) {
		if (typeof publication.setEnabled === 'function' && desired && publication.isEnabled !== false) {
			try {
				publication.setEnabled(false);
			} catch (error) {
				onError?.('setEnabled', label, error);
			}
		}
		if (desired) {
			setPublicationSubscribed(publication, label, false, onError);
		}
		return;
	}
	let didSubscribe = false;
	if (typeof publication.setSubscribed === 'function' && !desired) {
		try {
			publication.setSubscribed(true);
			didSubscribe = true;
		} catch (error) {
			onError?.('setSubscribed', label, error);
		}
	}
	const forceTrackSettingsUpdate = didSubscribe && !shouldEnable && publication.isEnabled === shouldEnable;
	setPublicationEnabled(publication, label, shouldEnable, forceTrackSettingsUpdate, onError);
	setPublicationVideoQuality(publication, label, videoQuality, onError);
}

export function refreshScreenSharePublicationSubscription({
	publication,
	label,
	shouldEnable = true,
	videoQuality = VideoQuality.HIGH,
	onError,
}: {
	publication: ScreenSharePublicationTarget | null | undefined;
	label: string;
	shouldEnable?: boolean;
	videoQuality?: VideoQuality;
	onError?: ScreenSharePublicationErrorHandler;
}): void {
	if (!publication) return;
	setPublicationSubscribed(publication, label, true, onError);
	setPublicationEnabled(publication, label, shouldEnable, true, onError);
	setPublicationVideoQuality(publication, label, videoQuality, onError);
}

export function resubscribeScreenSharePublication({
	publication,
	label,
	shouldEnable = true,
	videoQuality = VideoQuality.HIGH,
	onError,
}: {
	publication: ScreenSharePublicationTarget | null | undefined;
	label: string;
	shouldEnable?: boolean;
	videoQuality?: VideoQuality;
	onError?: ScreenSharePublicationErrorHandler;
}): void {
	if (!publication) return;
	const desired = publication.isDesired ?? publication.isSubscribed ?? true;
	if (desired && typeof publication.setEnabled === 'function' && publication.isEnabled !== false) {
		try {
			publication.setEnabled(false);
		} catch (error) {
			onError?.('setEnabled', label, error);
		}
	}
	setPublicationSubscribed(publication, label, false, onError);
	setPublicationSubscribed(publication, label, true, onError);
	setPublicationEnabled(publication, label, shouldEnable, true, onError);
	setPublicationVideoQuality(publication, label, videoQuality, onError);
}

export function syncWatchedScreenSharePublications({
	isScreenShare,
	isOwnScreenShare,
	userWantsToWatch,
	videoLocallyDisabled,
	audioEnabled,
	videoPublication,
	audioPublication,
	onError,
}: SyncWatchedScreenSharePublicationsOptions): void {
	const canSubscribeRemote = isScreenShare && !isOwnScreenShare;
	const shouldSubscribeVideo = canSubscribeRemote && userWantsToWatch && !videoLocallyDisabled;
	const shouldSubscribeAudio = canSubscribeRemote && userWantsToWatch;
	syncScreenSharePublication({
		publication: videoPublication,
		label: 'screen share video publication',
		shouldSubscribe: shouldSubscribeVideo,
		shouldEnable: shouldSubscribeVideo,
		videoQuality: shouldSubscribeVideo ? VideoQuality.HIGH : undefined,
		onError,
	});
	syncScreenSharePublication({
		publication: audioPublication,
		label: 'screen share audio publication',
		shouldSubscribe: shouldSubscribeAudio,
		shouldEnable: shouldSubscribeAudio && audioEnabled,
		onError,
	});
}

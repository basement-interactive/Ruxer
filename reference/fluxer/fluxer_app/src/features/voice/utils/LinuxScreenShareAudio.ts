// SPDX-License-Identifier: AGPL-3.0-or-later

import {Logger} from '@app/features/platform/utils/AppLogger';
import {getElectronAPI} from '@app/features/ui/utils/NativeUtils';
import {
	type MixedSelfWindowAudioTrack,
	mixTrackWithSelfWindowScreenShareAudio,
} from '@app/features/voice/utils/SelfWindowScreenShareAudioMix';

const logger = new Logger('LinuxScreenShareAudio');
const VIRTMIC_DEVICE_LABEL = 'fluxer-screen-share';
const VIRTMIC_DEVICE_DESCRIPTION = 'fluxer screen share audio';
const VIRTMIC_SAMPLE_RATE = 48000;

interface VirtmicCaptureOptions {
	includeSelfWindowAudio?: boolean;
}

let patched = false;
let armedToken: symbol | null = null;
let armedIncludeSelfWindowAudio = false;
let activeVirtmicSession: symbol | null = null;
let activeVirtmicCleanup: (() => void) | null = null;

function isLinuxDesktop(): boolean {
	const electronApi = getElectronAPI();
	return Boolean(electronApi) && electronApi?.platform === 'linux';
}

function isVirtmicDeviceLabel(label: string | undefined | null): boolean {
	if (!label) return false;
	const normalised = label.trim().toLowerCase();
	return normalised.includes(VIRTMIC_DEVICE_LABEL) || normalised.includes(VIRTMIC_DEVICE_DESCRIPTION);
}

async function findVirtmicDeviceId(): Promise<string | null> {
	try {
		const devices = await navigator.mediaDevices.enumerateDevices();
		const match = devices.find((device) => device.kind === 'audioinput' && isVirtmicDeviceLabel(device.label));
		if (!match) {
			logger.warn('virtmic device not present in enumerateDevices output', {
				audioInputLabels: devices
					.filter((device) => device.kind === 'audioinput')
					.map((device) => device.label || '<empty>'),
			});
			return null;
		}
		return match.deviceId;
	} catch (error) {
		logger.warn('enumerateDevices failed while looking up virtmic device', {error});
		return null;
	}
}

function cleanupActiveVirtmicSession(session: symbol): void {
	if (activeVirtmicSession !== session) return;
	const cleanup = activeVirtmicCleanup;
	activeVirtmicSession = null;
	activeVirtmicCleanup = null;
	try {
		cleanup?.();
	} catch (error) {
		logger.warn('virtmic session cleanup failed', {error});
	}
	void getElectronAPI()?.virtmic?.stop();
}

function patchTrackStopForCleanup(track: MediaStreamTrack, cleanup: () => void): () => void {
	const originalStop = track.stop;
	let restored = false;
	const restore = (): void => {
		if (restored) return;
		restored = true;
		try {
			Object.defineProperty(track, 'stop', {
				value: originalStop,
				configurable: true,
				writable: true,
			});
		} catch {
			try {
				(track as MediaStreamTrack & {stop: MediaStreamTrack['stop']}).stop = originalStop;
			} catch {}
		}
	};
	const patchedStop = function patchedVirtmicTrackStop(this: MediaStreamTrack): void {
		restore();
		cleanup();
		originalStop.call(this);
	};
	try {
		Object.defineProperty(track, 'stop', {
			value: patchedStop,
			configurable: true,
			writable: true,
		});
	} catch {
		try {
			(track as MediaStreamTrack & {stop: MediaStreamTrack['stop']}).stop = patchedStop;
		} catch {
			return () => undefined;
		}
	}
	return restore;
}

function attachVirtmicCleanup(stream: MediaStream, session: symbol): void {
	const tracks = [...stream.getVideoTracks(), ...stream.getAudioTracks()];
	if (tracks.length === 0) return;
	const cleanupListeners: Array<() => void> = [];
	const restoreStops: Array<() => void> = [];
	let detached = false;
	const cleanup = (): void => {
		if (detached) return;
		detached = true;
		for (const removeListener of cleanupListeners.splice(0)) {
			removeListener();
		}
		for (const restoreStop of restoreStops.splice(0)) {
			restoreStop();
		}
		cleanupActiveVirtmicSession(session);
	};
	for (const track of tracks) {
		const onEnded = (): void => cleanup();
		track.addEventListener('ended', onEnded);
		cleanupListeners.push(() => track.removeEventListener('ended', onEnded));
		restoreStops.push(patchTrackStopForCleanup(track, cleanup));
	}
}

function removeDisplayAudioTracks(stream: MediaStream): void {
	for (const existingAudio of stream.getAudioTracks()) {
		stream.removeTrack(existingAudio);
		try {
			existingAudio.stop();
		} catch {}
	}
}

function stopStreamTracks(stream: MediaStream): void {
	for (const track of stream.getTracks()) {
		try {
			track.stop();
		} catch {}
	}
}

export async function captureVirtmicAudioTrack(options: VirtmicCaptureOptions = {}): Promise<MediaStreamTrack | null> {
	if (!isLinuxDesktop()) return null;
	const deviceId = await findVirtmicDeviceId();
	if (!deviceId) {
		logger.info('virtmic device not present; cannot capture mid-stream audio substitution');
		return null;
	}
	let virtAudio: MediaStream;
	try {
		virtAudio = await navigator.mediaDevices.getUserMedia({
			audio: {
				deviceId: {exact: deviceId},
				autoGainControl: false,
				echoCancellation: false,
				noiseSuppression: false,
				channelCount: 2,
				sampleRate: VIRTMIC_SAMPLE_RATE,
				sampleSize: 16,
			},
		});
	} catch (error) {
		logger.warn('Failed to capture virtmic audio for mid-stream substitution', {error});
		return null;
	}
	const virtTrack = virtAudio.getAudioTracks()[0];
	if (!virtTrack) {
		logger.warn('virtmic getUserMedia returned no audio tracks');
		stopStreamTracks(virtAudio);
		return null;
	}
	let mixed: MixedSelfWindowAudioTrack | null = null;
	let track = virtTrack;
	if (options.includeSelfWindowAudio) {
		try {
			mixed = await mixTrackWithSelfWindowScreenShareAudio(virtTrack, {
				sampleRate: VIRTMIC_SAMPLE_RATE,
				unavailableMessage: 'Self-window app-audio tap unavailable for Linux system audio mix',
			});
			track = mixed.track;
		} catch (error) {
			logger.warn('Failed to mix self-window audio into virtmic capture', {error});
			stopStreamTracks(virtAudio);
			return null;
		}
	}
	let cleanedUp = false;
	const cleanup = (): void => {
		if (cleanedUp) return;
		cleanedUp = true;
		void mixed?.cleanup().catch((error) => {
			logger.warn('Failed to clean up virtmic self-window audio mix', {error});
		});
		stopStreamTracks(virtAudio);
	};
	const restoreStop = patchTrackStopForCleanup(track, cleanup);
	track.addEventListener(
		'ended',
		() => {
			restoreStop();
			cleanup();
		},
		{once: true},
	);
	return track;
}

async function substituteAudioTrack(stream: MediaStream, includeSelfWindowAudio: boolean): Promise<symbol | null> {
	const deviceId = await findVirtmicDeviceId();
	if (!deviceId) {
		logger.info('virtmic device not present after capture; removing native display audio to avoid echo');
		removeDisplayAudioTracks(stream);
		void getElectronAPI()?.virtmic?.stop();
		return null;
	}
	let virtAudio: MediaStream;
	try {
		virtAudio = await navigator.mediaDevices.getUserMedia({
			audio: {
				deviceId: {exact: deviceId},
				autoGainControl: false,
				echoCancellation: false,
				noiseSuppression: false,
				channelCount: 2,
				sampleRate: VIRTMIC_SAMPLE_RATE,
				sampleSize: 16,
			},
		});
	} catch (error) {
		logger.warn('Failed to capture virtmic audio; removing native display audio to avoid echo', {error});
		removeDisplayAudioTracks(stream);
		void getElectronAPI()?.virtmic?.stop();
		return null;
	}
	removeDisplayAudioTracks(stream);
	const virtTrack = virtAudio.getAudioTracks()[0];
	if (!virtTrack) {
		logger.warn('virtmic getUserMedia returned no audio tracks');
		stopStreamTracks(virtAudio);
		void getElectronAPI()?.virtmic?.stop();
		return null;
	}
	let mixed: MixedSelfWindowAudioTrack | null = null;
	let track = virtTrack;
	if (includeSelfWindowAudio) {
		try {
			mixed = await mixTrackWithSelfWindowScreenShareAudio(virtTrack, {
				sampleRate: VIRTMIC_SAMPLE_RATE,
				unavailableMessage: 'Self-window app-audio tap unavailable for Linux system audio mix',
			});
			track = mixed.track;
		} catch (error) {
			logger.warn('Failed to mix self-window audio into virtmic display capture', {error});
			stopStreamTracks(virtAudio);
			void getElectronAPI()?.virtmic?.stop();
			throw error;
		}
	}
	try {
		stream.addTrack(track);
	} catch (error) {
		logger.warn('Failed to add virtmic audio track to display stream', {error});
		await mixed?.cleanup().catch((cleanupError) => {
			logger.warn('Failed to clean up virtmic self-window audio mix after addTrack failure', {error: cleanupError});
		});
		stopStreamTracks(virtAudio);
		void getElectronAPI()?.virtmic?.stop();
		throw error;
	}
	const session = Symbol('virtmic-session');
	activeVirtmicSession = session;
	let cleanedUp = false;
	activeVirtmicCleanup = (): void => {
		if (cleanedUp) return;
		cleanedUp = true;
		void mixed?.cleanup().catch((error) => {
			logger.warn('Failed to clean up virtmic self-window audio mix', {error});
		});
		stopStreamTracks(virtAudio);
	};
	return session;
}

function installPatchIfNeeded(): void {
	if (patched) return;
	if (!isLinuxDesktop()) return;
	if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getDisplayMedia) return;
	const original = navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices);
	navigator.mediaDevices.getDisplayMedia = async function patchedGetDisplayMedia(
		this: MediaDevices,
		constraints?: DisplayMediaStreamOptions,
	): Promise<MediaStream> {
		const captureArmToken = armedToken;
		const includeSelfWindowAudio = armedIncludeSelfWindowAudio;
		let stream: MediaStream;
		try {
			stream = await original(constraints);
		} catch (error) {
			if (captureArmToken && armedToken === captureArmToken) {
				armedToken = null;
				armedIncludeSelfWindowAudio = false;
			}
			throw error;
		}
		if (captureArmToken && armedToken === captureArmToken) {
			armedToken = null;
			armedIncludeSelfWindowAudio = false;
			try {
				const session = await substituteAudioTrack(stream, includeSelfWindowAudio);
				if (!session) {
					stopStreamTracks(stream);
					throw new Error('virtmic audio substitution unavailable');
				}
				attachVirtmicCleanup(stream, session);
			} catch (error) {
				logger.warn('virtmic audio substitution failed', {error});
				stopStreamTracks(stream);
				throw error;
			}
		}
		return stream;
	};
	patched = true;
}

export function armVirtmicForNextCapture(options: VirtmicCaptureOptions = {}): void {
	installPatchIfNeeded();
	armedToken = Symbol('virtmic-arm');
	armedIncludeSelfWindowAudio = options.includeSelfWindowAudio === true;
}

export function disarmVirtmic(): void {
	armedToken = null;
	armedIncludeSelfWindowAudio = false;
	const session = activeVirtmicSession;
	if (session) {
		cleanupActiveVirtmicSession(session);
	}
}

let availabilityCache: Promise<boolean> | null = null;

export function isVirtmicAvailable(): Promise<boolean> {
	if (!isLinuxDesktop()) return Promise.resolve(false);
	if (!availabilityCache) {
		const electronApi = getElectronAPI();
		availabilityCache = electronApi?.virtmic
			? electronApi.virtmic
					.getAvailability()
					.then((status) => status.available)
					.catch(() => false)
			: Promise.resolve(false);
	}
	return availabilityCache;
}

export function resetVirtmicAvailabilityCache(): void {
	availabilityCache = null;
}

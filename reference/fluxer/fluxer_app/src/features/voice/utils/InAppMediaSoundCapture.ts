// SPDX-License-Identifier: AGPL-3.0-or-later

import {getSoundCaptureAudioContext, getSoundCaptureMasterGainNode} from '@app/features/notification/utils/SoundUtils';
import {Logger} from '@app/features/platform/utils/AppLogger';

const logger = new Logger('InAppMediaSoundCapture');

interface RoutedElement {
	source: MediaElementAudioSourceNode;
	gain: GainNode;
	volumeListener: () => void;
}

const routedElements: WeakMap<HTMLMediaElement, RoutedElement> = new WeakMap();

function syncGainFromElement(el: HTMLMediaElement, gain: GainNode): void {
	const volume = el.muted ? 0 : Math.max(0, Math.min(1, el.volume));
	try {
		gain.gain.value = volume;
	} catch {}
}

export function routeMediaElementForSoundCapture(element: HTMLMediaElement): () => void {
	if (routedElements.has(element)) {
		return () => undefined;
	}
	let ctx: AudioContext;
	let master: GainNode;
	try {
		ctx = getSoundCaptureAudioContext();
		master = getSoundCaptureMasterGainNode();
	} catch (error) {
		logger.debug('Sound capture context unavailable; leaving media element on native playback', {error});
		return () => undefined;
	}
	let source: MediaElementAudioSourceNode;
	let gain: GainNode;
	try {
		source = ctx.createMediaElementSource(element);
		gain = ctx.createGain();
		source.connect(gain);
		gain.connect(master);
	} catch (error) {
		logger.debug('Failed to route media element through sound capture graph', {error});
		return () => undefined;
	}
	syncGainFromElement(element, gain);
	const volumeListener = (): void => syncGainFromElement(element, gain);
	element.addEventListener('volumechange', volumeListener);
	const routed: RoutedElement = {source, gain, volumeListener};
	routedElements.set(element, routed);
	return () => {
		const entry = routedElements.get(element);
		if (!entry || entry !== routed) return;
		routedElements.delete(element);
		element.removeEventListener('volumechange', volumeListener);
		try {
			gain.disconnect();
		} catch {}
		try {
			source.disconnect();
		} catch {}
	};
}

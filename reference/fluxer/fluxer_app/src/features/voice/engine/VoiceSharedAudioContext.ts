// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from 'node:assert/strict';
import {Logger} from '@app/features/platform/utils/AppLogger';

const logger = new Logger('VoiceSharedAudioContext');

type AudioContextConstructor = typeof AudioContext;

let sharedAudioContext: AudioContext | null = null;

function resolveAudioContextConstructor(): AudioContextConstructor | null {
	if (typeof window === 'undefined') return null;
	const ctor =
		window.AudioContext ||
		(window as typeof window & {webkitAudioContext?: AudioContextConstructor}).webkitAudioContext;
	return ctor ?? null;
}

function installResumeOnUserGesture(context: AudioContext): void {
	if (typeof window === 'undefined') return;
	if (!window.document?.body) return;
	const body = window.document.body;
	const handleResume = (): void => {
		if (context.state === 'suspended') {
			void context.resume().catch((error) => {
				logger.debug('Failed to auto-resume shared voice AudioContext on user gesture', {error});
			});
		}
		body.removeEventListener('click', handleResume);
	};
	context.addEventListener('statechange', () => {
		if (context.state === 'closed') {
			body.removeEventListener('click', handleResume);
		}
	});
	body.addEventListener('click', handleResume);
}

export function getSharedVoiceAudioContext(): AudioContext | null {
	if (sharedAudioContext && sharedAudioContext.state !== 'closed') {
		return sharedAudioContext;
	}
	const ctor = resolveAudioContextConstructor();
	if (!ctor) return null;
	try {
		sharedAudioContext = new ctor({latencyHint: 'interactive'});
	} catch (error) {
		logger.warn('Failed to construct shared voice AudioContext', {error});
		sharedAudioContext = null;
		return null;
	}
	assert.notEqual(sharedAudioContext.state, 'closed', 'shared voice AudioContext must not start closed');
	if (sharedAudioContext.state === 'suspended') {
		void sharedAudioContext.resume().catch((error) => {
			logger.debug('Initial resume of shared voice AudioContext rejected', {error});
		});
		installResumeOnUserGesture(sharedAudioContext);
	}
	return sharedAudioContext;
}

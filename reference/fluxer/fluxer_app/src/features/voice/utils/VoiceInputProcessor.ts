// SPDX-License-Identifier: AGPL-3.0-or-later

import {Logger} from '@app/features/platform/utils/AppLogger';
import VoiceSettings from '@app/features/voice/state/VoiceSettings';
import {buildDeepFilterAudioChain, type DeepFilterAudioChain} from '@app/features/voice/utils/DeepFilterNoiseProcessor';
import {
	getActiveInputDeviceLabel,
	type ResolvedVoiceProcessing,
	resolveVoiceProcessingFromStateForDeviceLabel,
} from '@app/features/voice/utils/VoiceProcessingProfile';
import {inputVoiceVolumePercentToGain} from '@app/features/voice/utils/VoiceVolumeUtils';
import type {AudioProcessorOptions, LocalAudioTrack, Track, TrackProcessor} from 'livekit-client';

const logger = new Logger('VoiceInputProcessor');

class VoiceInputTrackProcessor implements TrackProcessor<Track.Kind.Audio, AudioProcessorOptions> {
	name = 'fluxer-voice-input-processor';
	processedTrack?: MediaStreamTrack;
	private sourceNode: MediaStreamAudioSourceNode | null = null;
	private gainNode: GainNode | null = null;
	private passthroughDestination: MediaStreamAudioDestinationNode | null = null;
	private deepFilterChain: DeepFilterAudioChain | null = null;

	constructor(
		private inputVolumePercent: number,
		private deepFilterEnabled: boolean,
		private deepFilterNoiseReductionLevel: number,
	) {}

	matchesMode(deepFilterEnabled: boolean, deepFilterNoiseReductionLevel: number): boolean {
		return (
			this.deepFilterEnabled === deepFilterEnabled &&
			this.deepFilterNoiseReductionLevel === deepFilterNoiseReductionLevel
		);
	}

	updateInputVolumePercent(nextPercent: number): void {
		this.inputVolumePercent = nextPercent;
		if (this.gainNode) {
			this.gainNode.gain.value = inputVoiceVolumePercentToGain(nextPercent);
		}
	}

	async init(opts: AudioProcessorOptions): Promise<void> {
		await this.rebuild(opts);
	}

	async restart(opts: AudioProcessorOptions): Promise<void> {
		await this.rebuild(opts);
	}

	async destroy(): Promise<void> {
		await this.teardown();
	}

	private async rebuild(opts: AudioProcessorOptions): Promise<void> {
		await this.teardown();
		try {
			this.sourceNode = opts.audioContext.createMediaStreamSource(new MediaStream([opts.track]));
			this.gainNode = opts.audioContext.createGain();
			this.gainNode.gain.value = inputVoiceVolumePercentToGain(this.inputVolumePercent);
			this.sourceNode.connect(this.gainNode);
			if (this.deepFilterEnabled) {
				const chain = await buildDeepFilterAudioChain({
					audioContext: opts.audioContext,
					noiseReductionLevel: this.deepFilterNoiseReductionLevel,
				});
				this.deepFilterChain = chain;
				this.gainNode.connect(chain.inputDestination);
				this.processedTrack = chain.processedTrack;
				return;
			}
			this.passthroughDestination = opts.audioContext.createMediaStreamDestination();
			this.gainNode.connect(this.passthroughDestination);
			const passthroughTrack = this.passthroughDestination.stream.getAudioTracks()[0];
			if (!passthroughTrack) {
				throw new Error('Voice input processor produced no passthrough output track');
			}
			this.processedTrack = passthroughTrack;
		} catch (error) {
			await this.teardown();
			throw error;
		}
	}

	private async teardown(): Promise<void> {
		this.sourceNode?.disconnect();
		this.gainNode?.disconnect();
		this.passthroughDestination?.disconnect();
		if (this.deepFilterChain) {
			try {
				await this.deepFilterChain.dispose();
			} catch (error) {
				logger.warn('Failed to dispose DeepFilter chain for voice input', error);
			}
		}
		if (this.processedTrack && this.processedTrack.readyState !== 'ended') {
			try {
				this.processedTrack.stop();
			} catch (error) {
				logger.warn('Failed to stop processed voice input track', error);
			}
		}
		this.sourceNode = null;
		this.gainNode = null;
		this.passthroughDestination = null;
		this.deepFilterChain = null;
		this.processedTrack = undefined;
	}
}

let activeTrack: LocalAudioTrack | null = null;
let activeProcessor: VoiceInputTrackProcessor | null = null;

function resolveActiveVoiceProcessing(): ResolvedVoiceProcessing {
	const label = getActiveInputDeviceLabel(VoiceSettings);
	return resolveVoiceProcessingFromStateForDeviceLabel(VoiceSettings, label);
}

function shouldUseVoiceInputProcessor(): boolean {
	return resolveActiveVoiceProcessing().deepFilter || VoiceSettings.getInputVolume() !== 100;
}

export async function syncVoiceInputProcessor(track: LocalAudioTrack | null): Promise<void> {
	if (!track) {
		await removeVoiceInputProcessor();
		return;
	}
	const profile = resolveActiveVoiceProcessing();
	const deepFilterEnabled = profile.deepFilter;
	const deepFilterNoiseReductionLevel = profile.deepFilterNoiseReductionLevel;
	const inputVolumePercent = VoiceSettings.getInputVolume();
	if (!shouldUseVoiceInputProcessor()) {
		await removeVoiceInputProcessor(track);
		return;
	}
	if (activeTrack === track && activeProcessor?.matchesMode(deepFilterEnabled, deepFilterNoiseReductionLevel)) {
		activeProcessor.updateInputVolumePercent(inputVolumePercent);
		return;
	}
	await removeVoiceInputProcessor();
	const processor = new VoiceInputTrackProcessor(inputVolumePercent, deepFilterEnabled, deepFilterNoiseReductionLevel);
	try {
		await track.setProcessor(processor);
	} catch (error) {
		logger.warn('Voice input processor install failed; publication remains on raw mic track', {
			error,
			deepFilterEnabled,
			inputVolumePercent,
		});
		try {
			await processor.destroy();
		} catch (destroyError) {
			logger.debug('Failed to destroy voice input processor after install failure', destroyError);
		}
		throw error;
	}
	activeTrack = track;
	activeProcessor = processor;
	logger.debug('Applied voice input processor', {inputVolumePercent, deepFilterEnabled});
}

export function updateVoiceInputGain(track: LocalAudioTrack | null): void {
	if (!shouldUseVoiceInputProcessor()) {
		void removeVoiceInputProcessor(track);
		return;
	}
	if (activeTrack === track && activeProcessor) {
		activeProcessor.updateInputVolumePercent(VoiceSettings.getInputVolume());
		return;
	}
	void syncVoiceInputProcessor(track);
}

export async function removeVoiceInputProcessor(track?: LocalAudioTrack | null): Promise<void> {
	if (!activeProcessor) {
		return;
	}
	const processor = activeProcessor;
	const processorTrack = activeTrack;
	if (track != null && processorTrack !== track) {
		return;
	}
	const shouldStopViaTrack = processorTrack != null && (track == null || track === processorTrack);
	let stoppedByTrack = false;
	let destroyedDirectly = false;
	try {
		if (shouldStopViaTrack) {
			await processorTrack.stopProcessor();
			stoppedByTrack = true;
		} else {
			destroyedDirectly = true;
			await processor.destroy();
		}
	} catch (error) {
		logger.warn('Failed to stop voice input processor', error);
	}
	if (!stoppedByTrack && !destroyedDirectly) {
		try {
			await processor.destroy();
		} catch (error) {
			logger.warn('Failed to destroy voice input processor after stop failure', error);
		}
	}
	if (activeProcessor === processor) {
		activeTrack = null;
		activeProcessor = null;
	}
}

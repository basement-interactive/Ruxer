// SPDX-License-Identifier: AGPL-3.0-or-later

import Accessibility from '@app/features/accessibility/state/Accessibility';
import {LimitResolver} from '@app/features/app/utils/LimitResolverAdapter';
import {TextareaButton} from '@app/features/channel/components/textarea/TextareaButton';
import styles from '@app/features/channel/components/textarea/TextareaButtons.module.css';
import {Logger} from '@app/features/platform/utils/AppLogger';
import {prepareVoiceMessageWav} from '@app/features/voice/utils/VoiceMessageRecordingUtils';
import {sendVoiceMessage} from '@app/features/voice/utils/VoiceMessageSendUtils';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {MicrophoneIcon} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import {motion, type Variants} from 'framer-motion';
import type React from 'react';
import {useCallback, useMemo, useRef, useState} from 'react';

const RECORDING_FAILED_PLEASE_TRY_AGAIN_DESCRIPTOR = msg({
	message: 'Recording failed. Try again.',
	comment: 'Error toast shown when the hold-to-record voice message recording fails.',
});
const VOICE_MESSAGE_DESCRIPTOR = msg({
	message: 'Voice message',
	comment: 'Filename label used for voice messages sent via the hold-to-record button.',
});
const UNABLE_TO_SEND_VOICE_MESSAGE_PLEASE_TRY_AGAIN_DESCRIPTOR = msg({
	message: 'Unable to send voice message. Try again.',
	comment: 'Error toast shown when sending a hold-to-record voice message fails.',
});
const VOICE_RECORDING_IS_NOT_SUPPORTED_IN_THIS_BROWSER_DESCRIPTOR = msg({
	message: 'Voice recording is not supported in this browser.',
	comment: 'Inline error when MediaRecorder is unsupported for the hold-to-record voice message flow.',
});
const UNABLE_TO_START_RECORDING_PLEASE_ALLOW_MICROPHONE_ACCESS_DESCRIPTOR = msg({
	message: 'Unable to start recording. Allow microphone access.',
	comment: 'Inline error when microphone permission is denied for the hold-to-record voice message flow.',
});
const RELEASE_TO_SEND_DESCRIPTOR = msg({
	message: 'Release to send',
	comment: 'Tooltip on the hold-to-record button while the user is actively holding to record.',
});
const HOLD_TO_SEND_VOICE_MESSAGE_DESCRIPTOR = msg({
	message: 'Hold to send voice message',
	comment: 'Tooltip on the hold-to-record button in its idle state.',
});
const logger = new Logger('HoldToRecordButton');
const recordingVariants: Variants = {
	idle: {
		scale: 1,
		boxShadow: '0 0 0 0px rgba(252, 95, 105, 0)',
	},
	recording: {
		scale: [1, 1.05, 1],
		boxShadow: [
			'0 0 0 0px rgba(252, 95, 105, 0.35)',
			'0 0 0 8px rgba(252, 95, 105, 0.15)',
			'0 0 0 0px rgba(252, 95, 105, 0.35)',
		],
		transition: {
			duration: 1.2,
			repeat: Infinity,
			ease: 'easeInOut',
		},
	},
};

interface HoldToRecordButtonProps {
	channelId: string;
	disabled?: boolean;
	onFallback?: () => void;
}

const HoldToRecordButton: React.FC<HoldToRecordButtonProps> = ({channelId, disabled, onFallback}) => {
	const {i18n} = useLingui();
	const [status, setStatus] = useState<'idle' | 'recording' | 'sending'>('idle');
	const [error, setError] = useState<string | null>(null);
	const mediaRecorderRef = useRef<MediaRecorder | null>(null);
	const streamRef = useRef<MediaStream | null>(null);
	const chunksRef = useRef<Array<Blob>>([]);
	const pointerIdRef = useRef<number | null>(null);
	const maxTimerRef = useRef<number | null>(null);
	const maxRecordingSeconds = useMemo(
		() => LimitResolver.resolve({key: 'max_voice_message_duration', fallback: 1200}),
		[],
	);
	const clearMaxTimer = useCallback(() => {
		if (maxTimerRef.current) {
			clearTimeout(maxTimerRef.current);
			maxTimerRef.current = null;
		}
	}, []);
	const releaseStream = useCallback(() => {
		if (streamRef.current) {
			streamRef.current.getTracks().forEach((track) => track.stop());
			streamRef.current = null;
		}
	}, []);
	const cleanupRecording = useCallback(() => {
		clearMaxTimer();
		releaseStream();
		mediaRecorderRef.current = null;
	}, [clearMaxTimer, releaseStream]);
	const handleRecordingStop = useCallback(
		async (blob: Blob) => {
			if (blob.size === 0) {
				setStatus('idle');
				setError(i18n._(RECORDING_FAILED_PLEASE_TRY_AGAIN_DESCRIPTOR));
				return;
			}
			setStatus('sending');
			try {
				const {file, duration, waveform} = await prepareVoiceMessageWav(blob, `voice-message-${Date.now()}.wav`);
				await sendVoiceMessage({
					channelId,
					file,
					waveform,
					duration,
					title: i18n._(VOICE_MESSAGE_DESCRIPTOR),
				});
				setStatus('idle');
				setError(null);
			} catch (err) {
				logger.error('Failed to send voice message', err);
				setError(i18n._(UNABLE_TO_SEND_VOICE_MESSAGE_PLEASE_TRY_AGAIN_DESCRIPTOR));
				setStatus('idle');
			}
		},
		[channelId, i18n],
	);
	const handleStopEvent = useCallback(() => {
		const recorder = mediaRecorderRef.current;
		if (!recorder) {
			setStatus('idle');
			return;
		}
		const recordedChunks = chunksRef.current;
		const blob = new Blob(recordedChunks, {type: recorder.mimeType || 'audio/ogg'});
		chunksRef.current = [];
		cleanupRecording();
		if (recordedChunks.length === 0) {
			setError(i18n._(RECORDING_FAILED_PLEASE_TRY_AGAIN_DESCRIPTOR));
			setStatus('idle');
			return;
		}
		void handleRecordingStop(blob);
	}, [cleanupRecording, handleRecordingStop, i18n]);
	const handleDataAvailable = useCallback((event: BlobEvent) => {
		if (event.data && event.data.size > 0) {
			chunksRef.current = [...chunksRef.current, event.data];
		}
	}, []);
	const stopRecording = useCallback(() => {
		const recorder = mediaRecorderRef.current;
		if (recorder && recorder.state !== 'inactive') {
			recorder.stop();
		}
	}, []);
	const startRecording = useCallback(async () => {
		if (status === 'recording' || status === 'sending') return;
		if (typeof navigator.mediaDevices === 'undefined' || typeof MediaRecorder === 'undefined') {
			setError(i18n._(VOICE_RECORDING_IS_NOT_SUPPORTED_IN_THIS_BROWSER_DESCRIPTOR));
			onFallback?.();
			return;
		}
		try {
			const stream = await navigator.mediaDevices.getUserMedia({audio: true});
			const preferredType = MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
				? 'audio/ogg;codecs=opus'
				: 'audio/webm;codecs=opus';
			const recorder = new MediaRecorder(stream, {mimeType: preferredType});
			chunksRef.current = [];
			recorder.addEventListener('dataavailable', handleDataAvailable);
			recorder.addEventListener('stop', handleStopEvent, {once: true});
			recorder.start();
			mediaRecorderRef.current = recorder;
			streamRef.current = stream;
			setStatus('recording');
			setError(null);
			clearMaxTimer();
			maxTimerRef.current = window.setTimeout(() => {
				stopRecording();
			}, maxRecordingSeconds * 1000);
		} catch (err) {
			logger.error('Failed to start voice recording', err);
			setError(i18n._(UNABLE_TO_START_RECORDING_PLEASE_ALLOW_MICROPHONE_ACCESS_DESCRIPTOR));
		}
	}, [clearMaxTimer, handleDataAvailable, handleStopEvent, maxRecordingSeconds, status, i18n]);
	const handlePointerDown = useCallback(
		(event: React.PointerEvent<HTMLButtonElement>) => {
			if (disabled || status === 'sending') return;
			event.preventDefault();
			pointerIdRef.current = event.pointerId;
			event.currentTarget.setPointerCapture(event.pointerId);
			void startRecording();
		},
		[disabled, startRecording, status],
	);
	const handlePointerUp = useCallback(
		(event: React.PointerEvent<HTMLButtonElement>) => {
			if (pointerIdRef.current !== event.pointerId) return;
			event.preventDefault();
			try {
				event.currentTarget.releasePointerCapture(event.pointerId);
			} catch {}
			pointerIdRef.current = null;
			stopRecording();
		},
		[stopRecording],
	);
	const handlePointerCancel = useCallback(
		(event: React.PointerEvent<HTMLButtonElement>) => {
			if (pointerIdRef.current !== event.pointerId) return;
			event.preventDefault();
			pointerIdRef.current = null;
			stopRecording();
		},
		[stopRecording],
	);
	const indicatorText = useMemo(() => {
		if (error) return error;
		if (status === 'recording') return i18n._(RELEASE_TO_SEND_DESCRIPTOR);
		return i18n._(HOLD_TO_SEND_VOICE_MESSAGE_DESCRIPTOR);
	}, [error, status, i18n.locale]);
	return (
		<motion.div
			className={styles.holdButtonWrapper}
			variants={recordingVariants}
			animate={status === 'recording' ? 'recording' : 'idle'}
			data-flx="channel.textarea.hold-to-record-button.hold-button-wrapper"
		>
			<TextareaButton
				icon={MicrophoneIcon}
				label={i18n._(VOICE_MESSAGE_DESCRIPTOR)}
				onPointerDown={handlePointerDown}
				onPointerUp={handlePointerUp}
				onPointerCancel={handlePointerCancel}
				onPointerLeave={handlePointerCancel}
				disabled={disabled || status === 'sending'}
				className={clsx(styles.holdButton, status === 'recording' && styles.holdButtonRecording)}
				data-flx="channel.textarea.hold-to-record-button.hold-button.pointer-down"
			/>
			<motion.span
				key={indicatorText}
				className={clsx(
					styles.holdIndicator,
					status === 'recording' && styles.holdIndicatorRecording,
					error && styles.holdIndicatorError,
				)}
				initial={Accessibility.useReducedMotion ? {opacity: 1, y: 0} : {opacity: 0, y: 5}}
				animate={{opacity: 1, y: 0}}
				transition={{duration: Accessibility.useReducedMotion ? 0 : 0.15}}
				data-flx="channel.textarea.hold-to-record-button.hold-indicator"
			>
				{indicatorText}
			</motion.span>
		</motion.div>
	);
};

export default HoldToRecordButton;

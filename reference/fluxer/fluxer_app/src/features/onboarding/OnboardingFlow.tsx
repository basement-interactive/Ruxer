// SPDX-License-Identifier: AGPL-3.0-or-later
//
// First-launch desktop onboarding. Shown once per install, before the user
// touches the app, to (1) ask for error-telemetry consent, (2) pick voice
// input/output devices, and (3) enable/skip the camera. Purely a desktop
// concern (device pickers + telemetry are desktop-only), so it renders nothing
// on web. State is entirely local + persisted through the shim; it never blocks
// the app underneath — it's an overlay the user can finish or skip.
//
// Fits the client's look by using its own design tokens (--background-*,
// --text-*, --accent-primary, --button-*, --radius-*) rather than hardcoded
// colors, so it tracks the active theme automatically.

import Authentication from '@app/features/auth/state/Authentication';
import {getElectronAPI, isDesktop} from '@app/features/ui/utils/NativeUtils';
import {getProtectedLocalStorage} from '@app/features/platform/state/ProtectedWebStorage';
import {setTelemetryEnabled} from '@app/features/platform/utils/Telemetry';
import {observer} from 'mobx-react-lite';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';

import styles from './OnboardingFlow.module.css';

const ONBOARDING_DONE_KEY = 'ruxer.onboarding.completed.v1';

/** Whether the first-launch onboarding should run: desktop only, and only if it
 * hasn't already been completed on this install. Telemetry consent being
 * unset (`null`) is the canonical "never asked" signal from Rust; we also keep
 * a localStorage flag so finishing/skipping sticks even if the user later
 * toggles telemetry off in Settings. */
export async function shouldShowOnboarding(): Promise<boolean> {
	if (!isDesktop()) return false;
	// The ONLY signal is our own "have they completed onboarding" flag. Do NOT
	// tie this to telemetry consent: a user who UPDATED from a pre-onboarding
	// build already has consent recorded (from the old Settings toggle) but has
	// never seen onboarding — keying off consent wrongly skipped them. Anyone
	// who hasn't finished/skipped the flow gets it, full stop.
	// MUST use the protected accessor, NOT the bare global `localStorage`: the
	// production build hardens storage by `delete window.localStorage` at boot
	// (ProtectedWebStorage.installBrowserStorageAccessProtection), so the global
	// throws after startup. `getProtectedLocalStorage()` returns the reference
	// captured BEFORE the deletion — the same persistent store every other key
	// uses. Using the bare global made the read throw → caught → always returned
	// true → onboarding re-showed every launch (and the write below silently
	// failed, so the flag never persisted).
	try {
		const ls = getProtectedLocalStorage();
		return ls ? ls.getItem(ONBOARDING_DONE_KEY) !== '1' : true;
	} catch {
		// private mode / storage blocked — show it (can't prove they've done it).
		return true;
	}
}

function markOnboardingDone(): void {
	try {
		getProtectedLocalStorage()?.setItem(ONBOARDING_DONE_KEY, '1');
	} catch {
		/* best effort */
	}
}

interface AudioDevice {
	deviceId: string;
	label: string;
	isDefault?: boolean;
}

type StepId = 'welcome' | 'telemetry' | 'audio' | 'camera' | 'done';
const STEP_ORDER: ReadonlyArray<StepId> = ['welcome', 'telemetry', 'audio', 'camera', 'done'];

interface OnboardingFlowProps {
	onComplete: () => void;
}

export function OnboardingFlow({onComplete}: OnboardingFlowProps): React.ReactElement {
	const [stepIndex, setStepIndex] = useState(0);
	const [leaving, setLeaving] = useState(false);
	// Direction drives the slide animation (forward = slide left, back = right).
	const [direction, setDirection] = useState<'fwd' | 'back'>('fwd');

	const step = STEP_ORDER[stepIndex];

	const finish = useCallback(() => {
		markOnboardingDone();
		setLeaving(true);
		// Let the exit animation play before unmounting.
		window.setTimeout(onComplete, 320);
	}, [onComplete]);

	const goNext = useCallback(() => {
		setDirection('fwd');
		setStepIndex((i) => Math.min(i + 1, STEP_ORDER.length - 1));
	}, []);
	const goBack = useCallback(() => {
		setDirection('back');
		setStepIndex((i) => Math.max(i - 1, 0));
	}, []);

	// Esc skips the whole flow (records completion so it won't re-show).
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') finish();
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [finish]);

	return (
		<div className={`${styles.backdrop} ${leaving ? styles.backdropLeaving : ''}`} data-flx="onboarding.backdrop">
			<div className={`${styles.card} ${leaving ? styles.cardLeaving : ''}`} role="dialog" aria-modal="true">
				<Progress index={stepIndex} total={STEP_ORDER.length} />
				<div className={styles.stage}>
					<div key={step} className={direction === 'fwd' ? styles.slideInFwd : styles.slideInBack}>
						{step === 'welcome' && <WelcomeStep onNext={goNext} onSkip={finish} />}
						{step === 'telemetry' && <TelemetryStep onNext={goNext} onBack={goBack} />}
						{step === 'audio' && <AudioStep onNext={goNext} onBack={goBack} />}
						{step === 'camera' && <CameraStep onNext={goNext} onBack={goBack} />}
						{step === 'done' && <DoneStep onFinish={finish} onBack={goBack} />}
					</div>
				</div>
			</div>
		</div>
	);
}

function Progress({index, total}: {index: number; total: number}): React.ReactElement {
	return (
		<div className={styles.progress} aria-hidden>
			{Array.from({length: total}).map((_, i) => (
				<span key={i} className={`${styles.pip} ${i <= index ? styles.pipActive : ''}`} />
			))}
		</div>
	);
}

function StepShell({
	icon,
	title,
	subtitle,
	children,
	footer,
}: {
	icon: string;
	title: string;
	subtitle: string;
	children?: React.ReactNode;
	footer: React.ReactNode;
}): React.ReactElement {
	return (
		<div className={styles.step}>
			<div className={styles.icon} aria-hidden>
				{icon}
			</div>
			<h1 className={styles.title}>{title}</h1>
			<p className={styles.subtitle}>{subtitle}</p>
			{children && <div className={styles.body}>{children}</div>}
			<div className={styles.footer}>{footer}</div>
		</div>
	);
}

function WelcomeStep({onNext, onSkip}: {onNext: () => void; onSkip: () => void}): React.ReactElement {
	return (
		<StepShell
			icon="👋"
			title="Welcome to Ruxer"
			subtitle="Let's get you set up in a few quick steps — telemetry, your mic and speakers, and your camera. Takes about a minute."
			footer={
				<>
					<button className={styles.ghostButton} onClick={onSkip}>
						Skip setup
					</button>
					<button className={styles.primaryButton} onClick={onNext}>
						Get started
					</button>
				</>
			}
		/>
	);
}

function TelemetryStep({onNext, onBack}: {onNext: () => void; onBack: () => void}): React.ReactElement {
	const [choice, setChoice] = useState<boolean | null>(null);
	const commit = useCallback(
		async (enabled: boolean) => {
			setChoice(enabled);
			await setTelemetryEnabled(enabled);
			onNext();
		},
		[onNext],
	);
	return (
		<StepShell
			icon="🛡️"
			title="Help improve Ruxer"
			subtitle="Ruxer can forward anonymous crash and error reports so problems get fixed faster. No message content or personal data is ever sent. You can change this anytime in Settings › Desktop."
			footer={
				<>
					<button className={styles.ghostButton} onClick={onBack}>
						Back
					</button>
					<button
						className={styles.secondaryButton}
						disabled={choice !== null}
						onClick={() => void commit(false)}
					>
						No thanks
					</button>
					<button
						className={styles.primaryButton}
						disabled={choice !== null}
						onClick={() => void commit(true)}
					>
						Enable telemetry
					</button>
				</>
			}
		/>
	);
}

function useAudioDevices(): {inputs: AudioDevice[]; outputs: AudioDevice[]; loading: boolean} {
	const [inputs, setInputs] = useState<AudioDevice[]>([]);
	const [outputs, setOutputs] = useState<AudioDevice[]>([]);
	const [loading, setLoading] = useState(true);
	useEffect(() => {
		let cancelled = false;
		void (async () => {
			const engine = getElectronAPI()?.voiceEngine;
			try {
				const [ins, outs] = await Promise.all([
					engine?.listAudioInputDevices?.() ?? Promise.resolve([]),
					engine?.listAudioOutputDevices?.() ?? Promise.resolve([]),
				]);
				if (!cancelled) {
					setInputs((ins as AudioDevice[]) ?? []);
					setOutputs((outs as AudioDevice[]) ?? []);
				}
			} catch {
				/* leave empty — the picker just shows "system default" */
			} finally {
				if (!cancelled) setLoading(false);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);
	return {inputs, outputs, loading};
}

function AudioStep({onNext, onBack}: {onNext: () => void; onBack: () => void}): React.ReactElement {
	const {inputs, outputs, loading} = useAudioDevices();
	const [output, setOutput] = useState<string>('');

	const applyOutput = useCallback((deviceId: string) => {
		setOutput(deviceId);
		void getElectronAPI()?.voiceEngine?.setAudioOutputDevice?.(deviceId);
	}, []);

	return (
		<StepShell
			icon="🎧"
			title="Set up your audio"
			subtitle="Pick the microphone and speakers you want to use for voice calls. You can change these later in Voice settings."
			footer={
				<>
					<button className={styles.ghostButton} onClick={onBack}>
						Back
					</button>
					<button className={styles.primaryButton} onClick={onNext}>
						Continue
					</button>
				</>
			}
		>
			{loading ? (
				<div className={styles.deviceLoading}>Detecting devices…</div>
			) : (
				<div className={styles.deviceGrid}>
					<label className={styles.field}>
						<span className={styles.fieldLabel}>Microphone</span>
						<div className={styles.selectWrap}>
							<select className={styles.select} defaultValue="">
								<option value="">System default</option>
								{inputs.map((d) => (
									<option key={d.deviceId} value={d.deviceId}>
										{d.label || d.deviceId}
									</option>
								))}
							</select>
						</div>
					</label>
					<label className={styles.field}>
						<span className={styles.fieldLabel}>Speakers</span>
						<div className={styles.selectWrap}>
							<select
								className={styles.select}
								value={output}
								onChange={(e) => applyOutput(e.target.value)}
							>
								<option value="">System default</option>
								{outputs.map((d) => (
									<option key={d.deviceId} value={d.deviceId}>
										{d.label || d.deviceId}
									</option>
								))}
							</select>
						</div>
					</label>
				</div>
			)}
		</StepShell>
	);
}

function CameraStep({onNext, onBack}: {onNext: () => void; onBack: () => void}): React.ReactElement {
	const videoRef = useRef<HTMLVideoElement>(null);
	const streamRef = useRef<MediaStream | null>(null);
	const [state, setState] = useState<'idle' | 'starting' | 'live' | 'error'>('idle');

	const stop = useCallback(() => {
		streamRef.current?.getTracks().forEach((t) => t.stop());
		streamRef.current = null;
	}, []);

	const start = useCallback(async () => {
		setState('starting');
		try {
			const stream = await navigator.mediaDevices.getUserMedia({video: true});
			streamRef.current = stream;
			if (videoRef.current) {
				videoRef.current.srcObject = stream;
			}
			setState('live');
		} catch {
			setState('error');
		}
	}, []);

	useEffect(() => stop, [stop]);

	const advance = useCallback(() => {
		stop();
		onNext();
	}, [stop, onNext]);

	return (
		<StepShell
			icon="🎥"
			title="Camera check"
			subtitle="Want to test your camera? Enable it for a quick preview, or skip — you can turn it on anytime during a call."
			footer={
				<>
					<button
						className={styles.ghostButton}
						onClick={() => {
							stop();
							onBack();
						}}
					>
						Back
					</button>
					<button className={styles.primaryButton} onClick={advance}>
						{state === 'live' ? 'Looks good' : 'Skip'}
					</button>
				</>
			}
		>
			<div className={styles.cameraPreview}>
				{state === 'live' ? (
					<video ref={videoRef} className={styles.video} autoPlay playsInline muted />
				) : (
					<button
						className={styles.cameraEnable}
						onClick={() => void start()}
						disabled={state === 'starting'}
					>
						{state === 'starting'
							? 'Starting…'
							: state === 'error'
								? 'Camera unavailable — click to retry'
								: 'Enable camera preview'}
					</button>
				)}
			</div>
		</StepShell>
	);
}

function DoneStep({onFinish, onBack}: {onFinish: () => void; onBack: () => void}): React.ReactElement {
	return (
		<StepShell
			icon="🎉"
			title="You're all set"
			subtitle="That's it — you're ready to go. You can revisit any of these in Settings whenever you like."
			footer={
				<>
					<button className={styles.ghostButton} onClick={onBack}>
						Back
					</button>
					<button className={styles.primaryButton} onClick={onFinish}>
						Enter Ruxer
					</button>
				</>
			}
		/>
	);
}

/** Small wrapper the app root mounts unconditionally; it self-checks whether to
 * render the flow and unmounts itself when finished. Keeps index.tsx's mount
 * path untouched beyond a single sibling element.
 *
 * Gated on authentication: onboarding is for a logged-IN user setting up their
 * client (telemetry / mic / camera), so it must not appear over the login
 * screen. `observer` re-runs this when `Authentication.isAuthenticated` flips,
 * so the flow pops the moment login completes (not before). The eligibility
 * check (`shouldShowOnboarding`) then runs once, after auth. */
export const OnboardingGate = observer(function OnboardingGate(): React.ReactElement | null {
	const [show, setShow] = useState(false);
	const checked = useRef(false);
	const authed = Authentication.isAuthenticated;
	useEffect(() => {
		if (!authed || checked.current) return;
		checked.current = true;
		void shouldShowOnboarding().then(setShow);
	}, [authed]);
	const memoOnComplete = useMemo(() => () => setShow(false), []);
	if (!authed || !show) return null;
	return <OnboardingFlow onComplete={memoOnComplete} />;
});

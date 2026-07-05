// SPDX-License-Identifier: AGPL-3.0-or-later

import {remFromPx} from '@app/features/theme/layout/RemFromPx';
import styles from '@app/features/voice/components/SignalStrengthIcon.module.css';
import {
	DEFAULT_LATENCY_SIGNAL_DEVIATION_THRESHOLDS,
	getLatencySignalState,
	type LatencySignalDeviationThresholds,
	type LatencySignalSample,
} from '@app/features/voice/utils/VoiceLatencySignal';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {clsx} from 'clsx';
import {useMemo} from 'react';

const SIGNAL_STRENGTH_LOADING_DESCRIPTOR = msg({
	message: 'Signal strength loading',
	comment: 'Aria label on the signal-strength icon shown while the first latency sample is still pending.',
});
const LATENCY_MILLISECONDS_DESCRIPTOR = msg({
	message: 'Latency {latency} milliseconds',
	comment: 'Aria label on the signal-strength icon. {latency} is the integer millisecond latency.',
});

interface Props {
	latency: number | null;
	className?: string;
	deviationThresholds?: LatencySignalDeviationThresholds;
	latencyHistory?: ReadonlyArray<LatencySignalSample>;
	size?: number;
	strokeWidth?: number;
}

const ARC_COUNT = 4;
const signalToneClassNames = {
	green: styles.green,
	yellow: styles.yellow,
	orange: styles.orange,
	red: styles.red,
} as const;

export function SignalStrengthIcon({
	latency,
	className,
	deviationThresholds = DEFAULT_LATENCY_SIGNAL_DEVIATION_THRESHOLDS,
	latencyHistory = [],
	size = 16,
	strokeWidth = 2,
}: Props) {
	const {i18n} = useLingui();
	const state = getLatencySignalState(latency, latencyHistory, deviationThresholds);
	const geom = useMemo(() => {
		const viewSize = size;
		const ox = strokeWidth / 2;
		const oy = viewSize - strokeWidth / 2;
		const maxR = viewSize - strokeWidth;
		const step = maxR / ARC_COUNT;
		const dotR = Math.max(1.5, strokeWidth - 0.5);
		const arcs = Array.from({length: ARC_COUNT}, (_, i) => {
			const r = step * (i + 1);
			const sx = ox;
			const sy = oy - r;
			const ex = ox + r;
			const ey = oy;
			const d = `M ${sx} ${sy} A ${r} ${r} 0 0 1 ${ex} ${ey}`;
			return {r, d, arcIndex: i + 1};
		});
		return {viewSize, ox, oy, dotR, arcs};
	}, [size, strokeWidth]);
	const ariaLabel =
		latency === null ? i18n._(SIGNAL_STRENGTH_LOADING_DESCRIPTOR) : i18n._(LATENCY_MILLISECONDS_DESCRIPTOR, {latency});
	const dotClass = state.kind === 'loading' ? styles.tertiary : signalToneClassNames[state.tone];
	return (
		<svg
			style={{width: remFromPx(size), height: remFromPx(size)}}
			viewBox={`0 0 ${geom.viewSize} ${geom.viewSize}`}
			className={clsx(styles.svg, className)}
			role="img"
			aria-label={ariaLabel}
			data-flx="voice.signal-strength-icon.svg"
		>
			<circle
				cx={geom.ox}
				cy={geom.oy}
				r={geom.dotR}
				className={dotClass}
				fill="currentColor"
				data-flx="voice.signal-strength-icon.circle"
			/>
			{geom.arcs.map(({d, arcIndex}, i) => {
				const isFilled = state.kind === 'value' ? i < state.filledCount : false;
				const arcClass =
					state.kind === 'loading'
						? styles.tertiaryMuted
						: clsx(isFilled ? signalToneClassNames[state.tone] : styles.tertiaryMuted);
				return (
					<path
						key={arcIndex}
						d={d}
						fill="none"
						stroke="currentColor"
						strokeWidth={strokeWidth}
						className={arcClass}
						strokeLinecap="round"
						data-flx="voice.signal-strength-icon.path"
					/>
				);
			})}
		</svg>
	);
}

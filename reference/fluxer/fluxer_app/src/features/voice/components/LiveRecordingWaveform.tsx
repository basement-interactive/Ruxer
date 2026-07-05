// SPDX-License-Identifier: AGPL-3.0-or-later

import styles from '@app/features/voice/components/LiveRecordingWaveform.module.css';
import {clsx} from 'clsx';
import {motion} from 'framer-motion';
import type React from 'react';
import {useEffect, useLayoutEffect, useRef, useState} from 'react';

const BAR_WIDTH_PX = 3;
const BAR_GAP_PX = 2;
const BAR_TOTAL_WIDTH_PX = BAR_WIDTH_PX + BAR_GAP_PX;
const VIEWPORT_HEIGHT_PX = 96;
const RECENT_BAR_COUNT = 8;
const MAX_BAR_HEIGHT_RATIO = 0.85;
const MIN_VISIBLE_HEIGHT_PX = 3;

interface LiveRecordingWaveformProps {
	amplitudes: ReadonlyArray<number>;
}

export const LiveRecordingWaveform: React.FC<LiveRecordingWaveformProps> = ({amplitudes}) => {
	const viewportRef = useRef<HTMLDivElement | null>(null);
	const [viewportWidth, setViewportWidth] = useState(0);

	useLayoutEffect(() => {
		const node = viewportRef.current;
		if (!node) return;
		const update = () => setViewportWidth(node.clientWidth);
		update();
		if (typeof ResizeObserver === 'undefined') {
			window.addEventListener('resize', update);
			return () => window.removeEventListener('resize', update);
		}
		const observer = new ResizeObserver(update);
		observer.observe(node);
		return () => observer.disconnect();
	}, []);

	const trackWidthPx = amplitudes.length * BAR_TOTAL_WIDTH_PX + 16;
	const translateX = viewportWidth > 0 ? Math.min(0, viewportWidth - trackWidthPx) : 0;
	const maxBarHeightPx = VIEWPORT_HEIGHT_PX * MAX_BAR_HEIGHT_RATIO;

	useEffect(() => {}, []);

	return (
		<div ref={viewportRef} className={styles.viewport} aria-hidden data-flx="voice.live-recording-waveform.viewport">
			<motion.div
				className={styles.track}
				animate={{x: translateX}}
				transition={{type: 'spring', stiffness: 140, damping: 22, mass: 0.6}}
				data-flx="voice.live-recording-waveform.track"
			>
				{amplitudes.map((amp, index) => {
					const normalised = Math.max(0, Math.min(1, amp));
					const heightPx = Math.max(MIN_VISIBLE_HEIGHT_PX, normalised * maxBarHeightPx);
					const isRecent = index >= amplitudes.length - RECENT_BAR_COUNT;
					return (
						<div
							key={index}
							className={clsx(styles.bar, isRecent && styles.barRecent)}
							style={{height: `${heightPx}px`}}
							data-flx="voice.live-recording-waveform.bar"
						/>
					);
				})}
			</motion.div>
		</div>
	);
};

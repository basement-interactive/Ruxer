// SPDX-License-Identifier: AGPL-3.0-or-later

import styles from '@app/features/app/components/layout/NativeTrafficLightsBackdrop.module.css';
import type {LayoutVariant} from '@app/features/app/state/LayoutVariantContext';
import {getFullscreenElement} from '@app/features/platform/utils/FullscreenMediaUtils';
import {clsx} from 'clsx';
import type React from 'react';
import {useEffect, useState} from 'react';

const FULLSCREEN_CHANGE_EVENTS = [
	'fullscreenchange',
	'webkitfullscreenchange',
	'mozfullscreenchange',
	'MSFullscreenChange',
];

function hasFullscreenElement(): boolean {
	if (typeof document === 'undefined') return false;
	return getFullscreenElement() !== null;
}

function useHasFullscreenElement(): boolean {
	const [active, setActive] = useState(hasFullscreenElement);
	useEffect(() => {
		const handleFullscreenChange = () => {
			setActive(hasFullscreenElement());
		};
		for (const eventName of FULLSCREEN_CHANGE_EVENTS) {
			document.addEventListener(eventName, handleFullscreenChange);
		}
		handleFullscreenChange();
		return () => {
			for (const eventName of FULLSCREEN_CHANGE_EVENTS) {
				document.removeEventListener(eventName, handleFullscreenChange);
			}
		};
	}, []);
	return active;
}

interface NativeTrafficLightsBackdropProps {
	variant?: LayoutVariant;
	className?: string;
	hidden?: boolean;
}

export const NativeTrafficLightsBackdrop: React.FC<NativeTrafficLightsBackdropProps> = ({
	variant = 'app',
	className,
	hidden = false,
}) => {
	const fullscreenActive = useHasFullscreenElement();
	if (hidden || fullscreenActive) return null;
	const backdropStyle = variant === 'auth' ? styles.backdropAuth : styles.backdropApp;
	return (
		<div
			aria-hidden="true"
			className={clsx(styles.backdropBase, backdropStyle, className)}
			data-flx="app.native-traffic-lights-backdrop.backdrop-base"
		/>
	);
};

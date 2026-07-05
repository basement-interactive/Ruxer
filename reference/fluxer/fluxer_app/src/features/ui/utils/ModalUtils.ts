// SPDX-License-Identifier: AGPL-3.0-or-later

import Accessibility from '@app/features/accessibility/state/Accessibility';
import * as ModalCommands from '@app/features/ui/commands/ModalCommands';
import LayerManager from '@app/features/ui/state/LayerManager';
import MobileLayout from '@app/features/ui/state/MobileLayout';
import {useId} from '@floating-ui/react';
import {
	type ReactNode,
	type RefObject,
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from 'react';

export type ModalSize = 'medium' | 'small' | 'large' | 'xlarge' | 'fullscreen';
export type LabelSource = 'header' | 'screen-reader';

export type ModalTransitionPreset = 'default' | 'instant' | 'profile-slide';

export interface ModalProps {
	children: ReactNode;
	className?: string;
	size?: ModalSize;
	initialFocusRef?: RefObject<HTMLElement | null> | RefObject<HTMLElement>;
	centered?: boolean;
	onClose?: () => void;
	onAnimationComplete?: () => void;
	backdropSlot?: ReactNode;
	transitionPreset?: ModalTransitionPreset;
	disableHistoryManagement?: boolean;
}

export interface ModalContextValue {
	getDefaultLabelId: (source: LabelSource) => string;
	registerLabel: (source: LabelSource, id: string) => () => void;
}

export interface ModalLogicState {
	isMobile: boolean;
	isFullscreenSize: boolean;
	isFullscreenOnMobile: boolean;
	useFullscreenLayer: boolean;
	useMobileEdgeToEdge: boolean;
	prefersReducedMotion: boolean;
	baseLabelId: string;
	modalKey: string;
	modalContextValue: ModalContextValue;
	handleBackdropClick: (onClose?: () => void) => void;
	handleClose: (onClose?: () => void) => void;
	registerLabel: (source: LabelSource, id: string) => () => void;
	getDefaultLabelId: (source: LabelSource) => string;
}

export function useModalLogic({
	size = 'medium',
	centered = false,
	onClose,
	onAnimationComplete: _onAnimationComplete,
}: Pick<ModalProps, 'size' | 'centered' | 'onClose' | 'onAnimationComplete'>): ModalLogicState {
	const isMobile = MobileLayout.enabled;
	const isFullscreenSize = size === 'fullscreen';
	const isFullscreenOnMobile = isMobile && !centered;
	const useFullscreenLayer = isFullscreenSize || isFullscreenOnMobile;
	const useMobileEdgeToEdge = isMobile && useFullscreenLayer;
	const prefersReducedMotion = Accessibility.useReducedMotion;
	const baseLabelId = useId() || 'modal';
	const modalKey = useRef(Math.random().toString(36).substring(7)).current;
	const [labelRegistry, setLabelRegistry] = useState<Partial<Record<LabelSource, string>>>({});
	const [hasMounted, setHasMounted] = useState(false);
	const backdropContaminatedRef = useRef<boolean>(false);
	const registerLabel = useCallback((source: LabelSource, id: string) => {
		setLabelRegistry((current) => ({...current, [source]: id}));
		return () => {
			setLabelRegistry((current) => {
				if (current[source] !== id) {
					return current;
				}
				const next = {...current};
				delete next[source];
				return next;
			});
		};
	}, []);
	const getDefaultLabelId = useCallback((source: LabelSource) => `${baseLabelId}-${source}`, [baseLabelId]);
	const labelledBy = useMemo(() => {
		const ids = Object.values(labelRegistry).filter(Boolean);
		return ids.length > 0 ? ids.join(' ') : undefined;
	}, [labelRegistry]);
	const modalContextValue = useMemo(() => ({getDefaultLabelId, registerLabel}), [getDefaultLabelId, registerLabel]);
	useEffect(() => {
		if (typeof queueMicrotask === 'function') {
			queueMicrotask(() => setHasMounted(true));
			return;
		}
		Promise.resolve().then(() => setHasMounted(true));
	}, []);
	useEffect(() => {
		if (!hasMounted || labelledBy) {
			return;
		}
		throw new Error(
			'Modal.Root requires either a Modal.Header or Modal.ScreenReaderLabel to provide an accessible label.',
		);
	}, [hasMounted, labelledBy]);
	useEffect(() => {
		LayerManager.addLayer('modal', modalKey, onClose);
		return () => {
			LayerManager.removeLayer('modal', modalKey);
		};
	}, [onClose, modalKey]);
	const handleBackdropClick = useCallback(
		(customOnClose?: () => void) => {
			if (backdropContaminatedRef.current) {
				return;
			}
			backdropContaminatedRef.current = true;
			setTimeout(() => {
				backdropContaminatedRef.current = false;
			}, 100);
			if (customOnClose) {
				customOnClose();
			} else if (onClose) {
				onClose();
			} else {
				ModalCommands.pop();
			}
		},
		[onClose],
	);
	const handleClose = useCallback(
		(customOnClose?: () => void) => {
			if (customOnClose) {
				customOnClose();
			} else if (onClose) {
				onClose();
			} else {
				ModalCommands.pop();
			}
		},
		[onClose],
	);
	return {
		isMobile,
		isFullscreenSize,
		isFullscreenOnMobile,
		useFullscreenLayer,
		useMobileEdgeToEdge,
		prefersReducedMotion,
		baseLabelId,
		modalKey,
		modalContextValue,
		handleBackdropClick,
		handleClose,
		registerLabel,
		getDefaultLabelId,
	};
}

export interface HeaderProps {
	children?: ReactNode;
	icon?: ReactNode;
	title: ReactNode;
	variant?: 'light' | 'dark';
	hideCloseButton?: boolean;
	onClose?: () => void;
	id?: string;
}

export interface HeaderLogicState {
	headingId: string;
	handleClose: () => void;
}

export function useHeaderLogic({
	title: _title,
	onClose,
	id,
	modalContextValue,
}: Pick<HeaderProps, 'title' | 'onClose' | 'id'> & {
	modalContextValue: ModalContextValue;
}): HeaderLogicState {
	const {getDefaultLabelId, registerLabel} = modalContextValue;
	const headingId = useMemo(() => id ?? getDefaultLabelId('header'), [getDefaultLabelId, id]);
	const useIsomorphicLayoutEffect = useLayoutEffect;
	useIsomorphicLayoutEffect(() => registerLabel('header', headingId), [headingId, registerLabel]);
	const handleClose = useCallback(() => {
		if (onClose) {
			onClose();
		} else {
			ModalCommands.pop();
		}
	}, [onClose]);
	return {
		headingId,
		handleClose,
	};
}

export interface ScreenReaderLabelProps {
	text: ReactNode;
	id?: string;
}

export interface ScreenReaderLabelLogicState {
	labelId: string;
}

export function useScreenReaderLabelLogic({
	text: _text,
	id,
	modalContextValue,
}: Pick<ScreenReaderLabelProps, 'text' | 'id'> & {
	modalContextValue: ModalContextValue;
}): ScreenReaderLabelLogicState {
	const {getDefaultLabelId, registerLabel} = modalContextValue;
	const labelId = useMemo(() => id ?? getDefaultLabelId('screen-reader'), [getDefaultLabelId, id]);
	const useIsomorphicLayoutEffect = useLayoutEffect;
	useIsomorphicLayoutEffect(() => registerLabel('screen-reader', labelId), [labelId, registerLabel]);
	return {
		labelId,
	};
}

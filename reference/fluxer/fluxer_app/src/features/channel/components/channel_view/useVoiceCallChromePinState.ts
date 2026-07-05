// SPDX-License-Identifier: AGPL-3.0-or-later

import ContextMenuState, {isContextMenuNodeTarget} from '@app/features/ui/state/ContextMenu';
import type React from 'react';
import {useRef, useState} from 'react';

interface VoiceCallChromePinState {
	voiceCallChromeRef: React.RefObject<HTMLDivElement | null>;
	isVoiceCallChromePinned: boolean;
	setIsVoiceCallChromePinnedByHeader: (pinned: boolean) => void;
	setIsVoiceCallChromePinnedByStreamInfo: (pinned: boolean) => void;
}

export function useVoiceCallChromePinState(): VoiceCallChromePinState {
	const voiceCallChromeRef = useRef<HTMLDivElement | null>(null);
	const [isVoiceCallChromePinnedByHeader, setIsVoiceCallChromePinnedByHeader] = useState(false);
	const [isVoiceCallChromePinnedByStreamInfo, setIsVoiceCallChromePinnedByStreamInfo] = useState(false);
	const contextMenuTarget = ContextMenuState.contextMenu?.target?.target ?? null;
	const isVoiceCallChromePinnedByContextMenu = Boolean(
		voiceCallChromeRef.current &&
			isContextMenuNodeTarget(contextMenuTarget) &&
			voiceCallChromeRef.current.contains(contextMenuTarget),
	);
	return {
		voiceCallChromeRef,
		isVoiceCallChromePinned:
			isVoiceCallChromePinnedByHeader || isVoiceCallChromePinnedByStreamInfo || isVoiceCallChromePinnedByContextMenu,
		setIsVoiceCallChromePinnedByHeader,
		setIsVoiceCallChromePinnedByStreamInfo,
	};
}

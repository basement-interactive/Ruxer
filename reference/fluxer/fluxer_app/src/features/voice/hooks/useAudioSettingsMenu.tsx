// SPDX-License-Identifier: AGPL-3.0-or-later

import * as ContextMenuCommands from '@app/features/ui/commands/ContextMenuCommands';
import {VoiceAudioSettingsMenu} from '@app/features/voice/components/VoiceSettingsMenus';
import type React from 'react';
import {useCallback} from 'react';

interface UseAudioSettingsMenuOptions {
	inputDevices: Array<MediaDeviceInfo>;
	outputDevices: Array<MediaDeviceInfo>;
	isMobile?: boolean;
	onOpenMobile?: () => void;
}

interface UseAudioSettingsMenuResult {
	renderAudioSettingsMenu: (props: {onClose: () => void}) => React.ReactNode;
	handleAudioSettingsContextMenu: (event: React.MouseEvent) => void;
}

export const useAudioSettingsMenu = ({
	inputDevices,
	outputDevices,
	isMobile = false,
	onOpenMobile,
}: UseAudioSettingsMenuOptions): UseAudioSettingsMenuResult => {
	const renderAudioSettingsMenu = useCallback(
		({onClose}: {onClose: () => void}) => (
			<VoiceAudioSettingsMenu
				inputDevices={inputDevices}
				outputDevices={outputDevices}
				onClose={onClose}
				data-flx="voice.use-audio-settings-menu.render-audio-settings-menu.voice-audio-settings-menu"
			/>
		),
		[inputDevices, outputDevices],
	);
	const handleAudioSettingsContextMenu = useCallback(
		(event: React.MouseEvent) => {
			if (isMobile) {
				event.preventDefault();
				event.stopPropagation();
				onOpenMobile?.();
				return;
			}
			ContextMenuCommands.openFromEvent(event, renderAudioSettingsMenu);
		},
		[isMobile, onOpenMobile, renderAudioSettingsMenu],
	);
	return {
		renderAudioSettingsMenu,
		handleAudioSettingsContextMenu,
	};
};

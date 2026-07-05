// SPDX-License-Identifier: AGPL-3.0-or-later

import {ScreenShareBufferingFrame} from '@app/features/voice/components/ScreenShareBufferingFrame';
import styles from '@app/features/voice/components/VoiceRegionTeleportOverlay.module.css';
import VoiceRegionTeleport from '@app/features/voice/state/VoiceRegionTeleport';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';

const TELEPORTING_DESCRIPTOR = msg({
	message: 'Teleporting you to another voice region...',
	comment:
		'Overlay label covering the whole voice call view while every participant is moved to a new voice region in place. Trailing ellipsis indicates in-progress.',
});

interface VoiceRegionTeleportOverlayProps {
	'data-flx'?: string;
}

export const VoiceRegionTeleportOverlay = observer(function VoiceRegionTeleportOverlay({
	'data-flx': dataFlx = 'voice.voice-region-teleport-overlay.root',
}: VoiceRegionTeleportOverlayProps) {
	const {i18n} = useLingui();
	if (!VoiceRegionTeleport.isTeleporting) {
		return null;
	}
	const label = i18n._(TELEPORTING_DESCRIPTOR);
	return (
		<div className={styles.overlay} data-flx={dataFlx}>
			<div className={styles.tile} data-flx="voice.voice-region-teleport-overlay.tile">
				<ScreenShareBufferingFrame
					variant="full"
					label={label}
					data-flx="voice.voice-region-teleport-overlay.buffering-frame"
				/>
			</div>
			<span className={styles.label} aria-hidden="true" data-flx="voice.voice-region-teleport-overlay.label">
				{label}
			</span>
		</div>
	);
});

// SPDX-License-Identifier: AGPL-3.0-or-later

import {AvatarStack} from '@app/features/ui/avatars/AvatarStack';
import {Avatar} from '@app/features/ui/components/Avatar';
import type {User} from '@app/features/user/models/User';
import {StreamInfoPill} from '@app/features/voice/components/StreamInfoPill';
import {StreamSpectatorsPopout} from '@app/features/voice/components/StreamSpectatorsPopout';
import type {SpectatorEntry} from '@app/features/voice/components/useStreamSpectators';
import type {StreamTrackInfo} from '@app/features/voice/components/useStreamTrackInfo';
import styles from '@app/features/voice/components/VoiceCallView.module.css';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';

const S_SCREEN_DESCRIPTOR = msg({
	message: "{streamerDisplayName}'s screen",
	comment:
		"Header label above a focused remote screen share. {streamerDisplayName} is the streamer's display name; possessive form.",
});

interface StreamFocusHeaderInfoProps {
	streamerUser: User;
	streamerDisplayName: string;
	viewerUsers: ReadonlyArray<User>;
	spectatorEntries: ReadonlyArray<SpectatorEntry>;
	trackInfo?: StreamTrackInfo | null;
	guildId?: string;
	channelId: string;
	onOpenChange?: (open: boolean) => void;
}

export function StreamFocusHeaderInfo({
	streamerUser,
	streamerDisplayName,
	viewerUsers,
	spectatorEntries,
	trackInfo,
	guildId,
	channelId,
	onOpenChange,
}: StreamFocusHeaderInfoProps) {
	const {i18n} = useLingui();
	return (
		<div className={styles.streamFocusInfo} data-flx="voice.stream-focus-header-info.stream-focus-info">
			<div className={styles.streamFocusStreamer} data-flx="voice.stream-focus-header-info.stream-focus-streamer">
				<Avatar user={streamerUser} size={20} guildId={guildId} data-flx="voice.stream-focus-header-info.avatar" />
				<span
					className={styles.streamFocusStreamerName}
					data-flx="voice.stream-focus-header-info.stream-focus-streamer-name"
				>
					{i18n._(S_SCREEN_DESCRIPTOR, {streamerDisplayName})}
				</span>
				{trackInfo && (
					<StreamInfoPill
						info={trackInfo}
						showLiveBadge={false}
						className={styles.streamFocusTrackInfo}
						data-flx="voice.stream-focus-header-info.stream-info-pill"
					/>
				)}
			</div>
			{viewerUsers.length > 0 && (
				<StreamSpectatorsPopout
					viewerUsers={viewerUsers}
					spectatorEntries={spectatorEntries}
					guildId={guildId}
					channelId={channelId}
					onOpenChange={onOpenChange}
					data-flx="voice.stream-focus-header-info.stream-spectators-popout"
				>
					<div
						className={styles.streamFocusSpectators}
						data-flx="voice.stream-focus-header-info.stream-focus-spectators"
					>
						<AvatarStack
							size={20}
							maxVisible={5}
							users={viewerUsers}
							guildId={guildId}
							channelId={channelId}
							data-flx="voice.stream-focus-header-info.avatar-stack"
						/>
					</div>
				</StreamSpectatorsPopout>
			)}
		</div>
	);
}

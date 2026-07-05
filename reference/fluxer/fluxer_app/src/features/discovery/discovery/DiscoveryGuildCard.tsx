// SPDX-License-Identifier: AGPL-3.0-or-later

import i18n from '@app/app/I18n';
import {GenericErrorModal} from '@app/features/app/components/alerts/GenericErrorModal';
import RuntimeConfig from '@app/features/app/state/RuntimeConfig';
import type {DiscoveryGuild} from '@app/features/discovery/commands/DiscoveryCommands';
import * as DiscoveryCommands from '@app/features/discovery/commands/DiscoveryCommands';
import styles from '@app/features/discovery/discovery/DiscoveryGuildCard.module.css';
import {GuildBadge} from '@app/features/guild/components/GuildBadge';
import {GuildIcon} from '@app/features/guild/components/popouts/GuildIcon';
import Guilds from '@app/features/guild/state/Guilds';
import {JOIN_COMMUNITY_DESCRIPTOR} from '@app/features/i18n/utils/CommonMessageDescriptors';
import * as NavigationCommands from '@app/features/navigation/commands/NavigationCommands';
import {failureCode} from '@app/features/platform/utils/ResponseInspection';
import {DiscoveryGuildContextMenu} from '@app/features/ui/action_menu/DiscoveryGuildContextMenu';
import {Button} from '@app/features/ui/button/Button';
import * as ContextMenuCommands from '@app/features/ui/commands/ContextMenuCommands';
import * as ModalCommands from '@app/features/ui/commands/ModalCommands';
import {modal} from '@app/features/ui/commands/ModalCommands';
import {getCurrentLocale} from '@app/features/user/utils/LocaleUtils';
import {APIErrorCodes} from '@fluxer/constants/src/ApiErrorCodes';
import type {DiscoveryCategory} from '@fluxer/constants/src/DiscoveryConstants';
import {DiscoveryCategoryLabels} from '@fluxer/constants/src/DiscoveryConstants';
import {GuildFeatures} from '@fluxer/constants/src/GuildConstants';
import {msg} from '@lingui/core/macro';
import {Plural, Trans, useLingui} from '@lingui/react/macro';
import {formatNumber} from '@pkgs/number_utils/src/NumberFormatting';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useCallback, useId, useState} from 'react';

const COULDN_T_JOIN_DESCRIPTOR = msg({
	message: "Couldn't join this community",
	comment: 'Title of the generic fallback error modal shown when joining a discovery community fails.',
});
const COULDN_T_JOIN_GENERIC_DESCRIPTOR = msg({
	message: 'Something went wrong. Please try again in a moment.',
	comment: 'Body of the generic fallback error modal shown when joining a discovery community fails.',
});
const SERVER_FULL_TITLE_DESCRIPTOR = msg({
	message: 'This community is full',
	comment: 'Title of the error modal shown when a discovery community has reached its member limit.',
});
const SERVER_FULL_MESSAGE_DESCRIPTOR = msg({
	message: "This community has reached its member limit, so you can't join right now.",
	comment: 'Body of the error modal shown when a discovery community has reached its member limit.',
});
const TOO_MANY_SERVERS_TITLE_DESCRIPTOR = msg({
	message: "You've reached the community limit",
	comment: 'Title of the error modal shown when the user is already in the maximum number of communities.',
});
const TOO_MANY_SERVERS_MESSAGE_DESCRIPTOR = msg({
	message: "You're in the maximum number of communities. Leave one and try again.",
	comment: 'Body of the error modal shown when the user is already in the maximum number of communities.',
});
const BANNED_TITLE_DESCRIPTOR = msg({
	message: "You can't join this community",
	comment: 'Title of the error modal shown when the user is banned from a discovery community.',
});
const BANNED_MESSAGE_DESCRIPTOR = msg({
	message: 'You have been banned from this community.',
	comment: 'Body of the error modal shown when the user is banned from a discovery community.',
});
const NOT_AVAILABLE_TITLE_DESCRIPTOR = msg({
	message: 'This community is no longer available',
	comment:
		'Title of the error modal shown when a discovery community is no longer joinable (delisted, invites off, or discovery disabled).',
});
const NOT_AVAILABLE_MESSAGE_DESCRIPTOR = msg({
	message: "It may have left discovery or turned off new joins. Refresh the page and you won't see it again.",
	comment:
		'Body of the error modal shown when a discovery community is no longer joinable (delisted, invites off, or discovery disabled).',
});
const GOING_TOO_FAST_TITLE_DESCRIPTOR = msg({
	message: "You're going too fast",
	comment: 'Title of the error modal shown when joining a discovery community is rate limited.',
});
const GOING_TOO_FAST_MESSAGE_DESCRIPTOR = msg({
	message: 'Please wait a moment and try again.',
	comment: 'Body of the error modal shown when joining a discovery community is rate limited.',
});

function resolveJoinGuildErrorContent(code: string | undefined): {title: string; message: string} {
	switch (code) {
		case APIErrorCodes.MAX_GUILD_MEMBERS:
			return {
				title: i18n._(SERVER_FULL_TITLE_DESCRIPTOR),
				message: i18n._(SERVER_FULL_MESSAGE_DESCRIPTOR),
			};
		case APIErrorCodes.MAX_GUILDS:
			return {
				title: i18n._(TOO_MANY_SERVERS_TITLE_DESCRIPTOR),
				message: i18n._(TOO_MANY_SERVERS_MESSAGE_DESCRIPTOR),
			};
		case APIErrorCodes.USER_BANNED_FROM_GUILD:
		case APIErrorCodes.USER_IP_BANNED_FROM_GUILD:
			return {
				title: i18n._(BANNED_TITLE_DESCRIPTOR),
				message: i18n._(BANNED_MESSAGE_DESCRIPTOR),
			};
		case APIErrorCodes.DISCOVERY_NOT_DISCOVERABLE:
		case APIErrorCodes.DISCOVERY_DISABLED:
		case APIErrorCodes.INVITES_DISABLED:
			return {
				title: i18n._(NOT_AVAILABLE_TITLE_DESCRIPTOR),
				message: i18n._(NOT_AVAILABLE_MESSAGE_DESCRIPTOR),
			};
		case APIErrorCodes.RATE_LIMITED:
			return {
				title: i18n._(GOING_TOO_FAST_TITLE_DESCRIPTOR),
				message: i18n._(GOING_TOO_FAST_MESSAGE_DESCRIPTOR),
			};
		default:
			return {
				title: i18n._(COULDN_T_JOIN_DESCRIPTOR),
				message: i18n._(COULDN_T_JOIN_GENERIC_DESCRIPTOR),
			};
	}
}

function showJoinGuildErrorModal(error: unknown): void {
	const {title, message} = resolveJoinGuildErrorContent(failureCode(error));
	ModalCommands.push(
		modal(() => (
			<GenericErrorModal
				title={title}
				message={message}
				data-flx="discovery.discovery-guild-card.join.generic-error-modal"
			/>
		)),
	);
}
const NO_DESCRIPTION_PROVIDED_DESCRIPTOR = msg({
	message: 'No description.',
	comment: 'Empty-state text in the discovery guild card.',
});
const ONLINE_DESCRIPTOR = msg({
	message: '{onlineCount} online',
	comment: 'Short label in the discovery guild card. Keep it concise. Preserve {onlineCount}; it is inserted by code.',
});
const JOINED_DESCRIPTOR = msg({
	message: 'Joined',
	comment: 'Button or menu action label in the discovery guild card. Keep it concise.',
});
const JOIN_NAMED_COMMUNITY_DESCRIPTOR = msg({
	message: 'Join {communityName}',
	comment: 'Accessible label for a Discovery guild card join button. {communityName} is the public community name.',
});
const JOINED_NAMED_COMMUNITY_DESCRIPTOR = msg({
	message: 'Joined {communityName}',
	comment:
		'Accessible label for a disabled Discovery guild card join button when the user is already in the community. {communityName} is the public community name.',
});
const DISCOVERY_NAME_BADGE_IGNORED_FEATURES = new Set<string>([GuildFeatures.DISCOVERABLE]);

interface DiscoveryGuildCardProps {
	guild: DiscoveryGuild;
}

export const DiscoveryGuildCard = observer(function DiscoveryGuildCard({guild}: DiscoveryGuildCardProps) {
	const {i18n} = useLingui();
	const nameId = useId();
	const [joining, setJoining] = useState(false);
	const isAlreadyMember = Guilds.getGuild(guild.id) != null;
	const categoryLabel = DiscoveryCategoryLabels[guild.category_type as DiscoveryCategory] ?? '';
	const onlineCount = formatNumber(guild.online_count, getCurrentLocale());
	const nameBadgeFeatures = guild.features.filter((feature) => !DISCOVERY_NAME_BADGE_IGNORED_FEATURES.has(feature));
	const handleJoin = useCallback(async () => {
		if (joining || isAlreadyMember) return;
		setJoining(true);
		try {
			await DiscoveryCommands.joinGuild(guild.id);
			NavigationCommands.selectGuild(guild.id);
		} catch (error) {
			setJoining(false);
			showJoinGuildErrorModal(error);
		}
	}, [guild.id, joining, isAlreadyMember]);
	const handleContextMenu = useCallback(
		(event: React.MouseEvent) => {
			event.preventDefault();
			event.stopPropagation();
			ContextMenuCommands.openFromEvent(event, (props) => (
				<DiscoveryGuildContextMenu
					guild={{id: guild.id, name: guild.name}}
					onClose={props.onClose}
					data-flx="discovery.discovery.discovery-guild-card.handle-context-menu.discovery-guild-context-menu"
				/>
			));
		},
		[guild.id, guild.name],
	);
	const joinButtonLabel = isAlreadyMember
		? i18n._(JOINED_NAMED_COMMUNITY_DESCRIPTOR, {communityName: guild.name})
		: i18n._(JOIN_NAMED_COMMUNITY_DESCRIPTOR, {communityName: guild.name});
	return (
		<article
			aria-labelledby={nameId}
			className={styles.card}
			onContextMenu={handleContextMenu}
			data-flx="discovery.discovery.discovery-guild-card.card.context-menu"
		>
			<div className={styles.cardBody} data-flx="discovery.discovery.discovery-guild-card.card-body">
				<div className={styles.header} data-flx="discovery.discovery.discovery-guild-card.header">
					<GuildIcon
						id={guild.id}
						name={guild.name}
						icon={guild.icon}
						className={styles.icon}
						containerProps={{'aria-hidden': true}}
						data-flx="discovery.discovery.discovery-guild-card.icon"
					/>
					<div className={styles.titleRow} data-flx="discovery.discovery.discovery-guild-card.title-row">
						<h3 id={nameId} className={styles.name} data-flx="discovery.discovery.discovery-guild-card.name">
							<span className={styles.nameText} data-flx="discovery.discovery.discovery-guild-card.name-text">
								{guild.name}
							</span>
							<GuildBadge
								features={nameBadgeFeatures}
								tooltipPosition="bottom"
								data-flx="discovery.discovery.discovery-guild-card.guild-badge"
							/>
						</h3>
					</div>
				</div>
				{categoryLabel && (
					<span className={styles.category} data-flx="discovery.discovery.discovery-guild-card.category">
						{categoryLabel}
					</span>
				)}
				<p className={styles.description} data-flx="discovery.discovery.discovery-guild-card.description">
					<span className={styles.srOnly} data-flx="discovery.discovery.discovery-guild-card.sr-only">
						<Trans>About this community: </Trans>
					</span>
					{guild.description || i18n._(NO_DESCRIPTION_PROVIDED_DESCRIPTOR)}
				</p>
			</div>
			<div className={styles.footer} data-flx="discovery.discovery.discovery-guild-card.footer">
				<div className={styles.stats} data-flx="discovery.discovery.discovery-guild-card.stats">
					<div className={styles.stat} data-flx="discovery.discovery.discovery-guild-card.stat">
						<div
							className={styles.statDotOnline}
							aria-hidden
							data-flx="discovery.discovery.discovery-guild-card.stat-dot-online"
						/>
						<span className={styles.statText} data-flx="discovery.discovery.discovery-guild-card.stat-text">
							{i18n._(ONLINE_DESCRIPTOR, {onlineCount})}
						</span>
					</div>
					<div className={styles.stat} data-flx="discovery.discovery.discovery-guild-card.stat--2">
						<div
							className={styles.statDotMembers}
							aria-hidden
							data-flx="discovery.discovery.discovery-guild-card.stat-dot-members"
						/>
						<span className={styles.statText} data-flx="discovery.discovery.discovery-guild-card.stat-text--2">
							<Trans>
								<Plural
									value={guild.member_count}
									one="# member"
									other="# members"
									data-flx="discovery.discovery.discovery-guild-card.plural"
								/>
							</Trans>
						</span>
					</div>
				</div>
				{!RuntimeConfig.singleCommunityEnabled && (
					<Button
						variant="primary"
						className={styles.joinButton}
						onClick={handleJoin}
						disabled={joining || isAlreadyMember}
						aria-label={joinButtonLabel}
						data-flx="discovery.discovery.discovery-guild-card.join-button"
					>
						{isAlreadyMember ? i18n._(JOINED_DESCRIPTOR) : i18n._(JOIN_COMMUNITY_DESCRIPTOR)}
					</Button>
				)}
			</div>
		</article>
	);
});

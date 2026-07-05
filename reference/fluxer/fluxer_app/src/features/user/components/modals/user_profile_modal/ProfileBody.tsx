// SPDX-License-Identifier: AGPL-3.0-or-later

import Authentication from '@app/features/auth/state/Authentication';
import type {Channel} from '@app/features/channel/models/Channel';
import type {Guild} from '@app/features/guild/models/Guild';
import {focusChannelTextareaAfterNavigation} from '@app/features/messaging/utils/ChannelTextareaFocusUtils';
import * as NavigationCommands from '@app/features/navigation/commands/NavigationCommands';
import SelectedChannel from '@app/features/navigation/state/SelectedChannel';
import {GroupDMContextMenu} from '@app/features/ui/action_menu/GroupDMContextMenu';
import {GuildContextMenu} from '@app/features/ui/action_menu/GuildContextMenu';
import {GuildMemberContextMenu} from '@app/features/ui/action_menu/GuildMemberContextMenu';
import {UserContextMenu} from '@app/features/ui/action_menu/UserContextMenu';
import * as ContextMenuCommands from '@app/features/ui/commands/ContextMenuCommands';
import * as ModalCommands from '@app/features/ui/commands/ModalCommands';
import {modal} from '@app/features/ui/commands/ModalCommands';
import {Scroller} from '@app/features/ui/components/Scroller';
import ModalState from '@app/features/ui/state/Modal';
import {Tabs} from '@app/features/ui/tabs/Tabs';
import {UserProfileModal} from '@app/features/user/components/modals/UserProfileModal';
import userProfileModalStyles from '@app/features/user/components/modals/UserProfileModal.module.css';
import {MutualFriendItem} from '@app/features/user/components/modals/user_profile_modal/MutualFriendItem';
import {MutualGroupItem} from '@app/features/user/components/modals/user_profile_modal/MutualGroupItem';
import {MutualGuildItem} from '@app/features/user/components/modals/user_profile_modal/MutualGuildItem';
import {
	getMutualItemsDescriptor,
	NO_MUTUAL_COMMUNITIES_FOUND_DESCRIPTOR,
} from '@app/features/user/components/modals/user_profile_modal/MutualItemsDescriptors';
import {
	getMutualCommunityDisplayItems,
	getMutualGroupChannels,
} from '@app/features/user/components/modals/user_profile_modal/MutualItemsUtils';
import {ProfileContent} from '@app/features/user/components/modals/user_profile_modal/ProfileContent';
import {
	isContextMenuOpenForTarget,
	type ProfileBodyProps,
	type ProfileTab,
	useContextMenuTarget,
} from '@app/features/user/components/modals/user_profile_modal/UserProfileModalShared';
import {UserInfo} from '@app/features/user/components/modals/user_profile_modal/UserProfileModalUserInfo';
import {User} from '@app/features/user/models/User';
import {ME} from '@fluxer/constants/src/AppConstants';
import type {UserPartial} from '@fluxer/schema/src/domains/user/UserResponseSchemas';
import {msg} from '@lingui/core/macro';
import {Trans, useLingui} from '@lingui/react/macro';
import {UsersThreeIcon} from '@phosphor-icons/react';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';

const MUTUAL_FRIENDS_DESCRIPTOR = msg({
	message: 'Mutual friends ({count})',
	comment: 'Short label in the user profile modal. Keep it concise. Preserve {count}; it is inserted by code.',
});
const OVERVIEW_DESCRIPTOR = msg({
	message: 'Overview',
	comment: 'Short label in the user profile modal. Keep it concise.',
});
const MIN_TABS_SCALE = 0.7;
const TABS_SCALE_EPSILON = 0.001;
const TABS_FIT_PADDING = 1;

function measureUnwrappedTablistWidth(tablist: HTMLElement): number {
	const clone = tablist.cloneNode(true) as HTMLElement;
	clone.setAttribute('aria-hidden', 'true');
	clone.style.position = 'absolute';
	clone.style.visibility = 'hidden';
	clone.style.pointerEvents = 'none';
	clone.style.insetBlockStart = '0';
	clone.style.insetInlineStart = '0';
	clone.style.zIndex = '-1';
	clone.style.width = 'max-content';
	clone.style.minWidth = 'max-content';
	clone.style.flexWrap = 'nowrap';
	clone.style.setProperty('--tabs-scale', '1');
	document.body.append(clone);
	try {
		return Array.from(clone.children).reduce((total, child) => {
			return total + child.getBoundingClientRect().width;
		}, 0);
	} finally {
		clone.remove();
	}
}

export const ProfileBody: React.FC<ProfileBodyProps> = observer(
	({profile, user, userNote, autoFocusNote, noteRef, showProfileDataWarning}) => {
		const {i18n} = useLingui();
		const showMutualFriendsTab = !user.bot;
		const [activeTab, setActiveTab] = useState<ProfileTab>('overview');
		const handleTabChange = useCallback((tab: ProfileTab) => {
			setActiveTab(tab);
		}, []);
		const mutualFriends = profile?.mutualFriends ?? [];
		const profileMutualGuilds = profile?.mutualGuilds ?? [];
		const mutualGroups = getMutualGroupChannels(user.id);
		const mutualCommunityDisplayItems = getMutualCommunityDisplayItems(profileMutualGuilds);
		const mutualCommunitiesCount = mutualCommunityDisplayItems.length;
		const mutualGroupsCount = mutualGroups.length;
		const mutualCommunitiesGroupsCount = mutualGroupsCount + mutualCommunitiesCount;
		const contextMenuTarget = useContextMenuTarget();
		const isCurrentUser = user.id === Authentication.currentUserId;
		const isContextMenuOpenFor = useCallback(
			(target: EventTarget | null) => isContextMenuOpenForTarget(contextMenuTarget, target),
			[contextMenuTarget],
		);
		const tabs = useMemo(() => {
			const items: Array<{key: ProfileTab; label: string}> = [{key: 'overview', label: i18n._(OVERVIEW_DESCRIPTOR)}];
			if (showMutualFriendsTab) {
				items.push({
					key: 'mutual_friends',
					label: i18n._(MUTUAL_FRIENDS_DESCRIPTOR, {count: mutualFriends.length}),
				});
			}
			items.push({
				key: 'mutual_communities_groups',
				label: i18n._(
					getMutualItemsDescriptor({
						mutualCommunitiesCount,
						mutualGroupsCount,
						includeCount: true,
					}),
					{count: mutualCommunitiesGroupsCount},
				),
			});
			return items;
		}, [
			showMutualFriendsTab,
			mutualFriends.length,
			mutualCommunitiesCount,
			mutualGroupsCount,
			mutualCommunitiesGroupsCount,
			i18n.locale,
		]);
		useEffect(() => {
			if (tabs.some((tab) => tab.key === activeTab)) {
				return;
			}
			setActiveTab(tabs[0]?.key ?? 'overview');
		}, [activeTab, tabs]);
		const tabsWrapperRef = useRef<HTMLDivElement>(null);
		useLayoutEffect(() => {
			const wrapper = tabsWrapperRef.current;
			if (!wrapper) return;
			let rafId: number | null = null;
			const measure = () => {
				rafId = null;
				const tablist = wrapper.querySelector<HTMLElement>('[role="tablist"]');
				if (!tablist) return;
				const available = wrapper.clientWidth - TABS_FIT_PADDING;
				if (available <= 0) return;
				const currentScaleValue = Number.parseFloat(getComputedStyle(wrapper).getPropertyValue('--tabs-scale'));
				const currentScale = Number.isFinite(currentScaleValue) && currentScaleValue > 0 ? currentScaleValue : 1;
				const naturalWidth = measureUnwrappedTablistWidth(tablist);
				if (naturalWidth <= 0) return;
				const shouldWrap = naturalWidth * MIN_TABS_SCALE > available;
				if (shouldWrap) {
					wrapper.dataset.tabsWrapped = 'true';
				} else {
					delete wrapper.dataset.tabsWrapped;
				}
				const nextScale = shouldWrap ? MIN_TABS_SCALE : Math.min(1, Math.max(MIN_TABS_SCALE, available / naturalWidth));
				if (Math.abs(currentScale - nextScale) < TABS_SCALE_EPSILON) {
					return;
				}
				wrapper.style.setProperty('--tabs-scale', nextScale.toFixed(4));
			};
			const scheduleMeasure = () => {
				if (rafId !== null) cancelAnimationFrame(rafId);
				rafId = requestAnimationFrame(measure);
			};
			measure();
			const observer = new ResizeObserver(scheduleMeasure);
			observer.observe(wrapper);
			const tablist = wrapper.querySelector<HTMLElement>('[role="tablist"]');
			for (const tab of Array.from(tablist?.children ?? [])) {
				observer.observe(tab);
			}
			return () => {
				observer.disconnect();
				if (rafId !== null) cancelAnimationFrame(rafId);
			};
		}, [tabs]);
		const handleMutualFriendClick = useCallback(
			(friendId: string) => {
				const currentModal = ModalState.getModal();
				if (currentModal) {
					ModalCommands.update(currentModal.key, () =>
						modal(() => (
							<UserProfileModal
								userId={friendId}
								guildId={profile?.guildId ?? undefined}
								data-flx="user.user-profile-modal.handle-mutual-friend-click.user-profile-modal"
							/>
						)),
					);
				}
			},
			[profile],
		);
		const handleMutualFriendContextMenu = useCallback(
			(event: React.MouseEvent, friend: User) => {
				event.preventDefault();
				event.stopPropagation();
				ContextMenuCommands.openFromEvent(event, ({onClose}) => (
					<>
						{profile?.guildId ? (
							<GuildMemberContextMenu
								user={friend}
								guildId={profile.guildId}
								onClose={onClose}
								data-flx="user.user-profile-modal.handle-mutual-friend-context-menu.guild-member-context-menu"
							/>
						) : (
							<UserContextMenu
								user={friend}
								onClose={onClose}
								data-flx="user.user-profile-modal.handle-mutual-friend-context-menu.user-context-menu"
							/>
						)}
					</>
				));
			},
			[profile],
		);
		const handleGuildClick = useCallback((guild: Guild) => {
			ModalCommands.pop();
			const selectedChannel = SelectedChannel.selectedChannelIds.get(guild.id);
			NavigationCommands.selectGuild(guild.id, selectedChannel);
		}, []);
		const handleGuildContextMenu = useCallback((event: React.MouseEvent, guild: Guild) => {
			event.preventDefault();
			event.stopPropagation();
			ContextMenuCommands.openFromEvent(event, (props) => (
				<GuildContextMenu
					guild={guild}
					onClose={props.onClose}
					data-flx="user.user-profile-modal.handle-guild-context-menu.guild-context-menu"
				/>
			));
		}, []);
		const handleGroupClick = useCallback((group: Channel) => {
			ModalCommands.pop();
			NavigationCommands.selectChannel(ME, group.id);
			focusChannelTextareaAfterNavigation(group.id);
		}, []);
		const handleGroupContextMenu = useCallback((event: React.MouseEvent, group: Channel) => {
			event.preventDefault();
			event.stopPropagation();
			ContextMenuCommands.openFromEvent(event, ({onClose}) => (
				<GroupDMContextMenu
					channel={group}
					onClose={onClose}
					data-flx="user.user-profile-modal.handle-group-context-menu.group-dm-context-menu"
				/>
			));
		}, []);
		const renderMutualFriendsList = () => (
			<div
				className={userProfileModalStyles.mutualFriendsList}
				data-flx="user.user-profile-modal.render-mutual-friends-list.div"
			>
				{mutualFriends.map((friend: UserPartial) => {
					const friendRecord = new User(friend);
					return (
						<MutualFriendItem
							key={friendRecord.id}
							user={friendRecord}
							profile={profile}
							onClick={() => handleMutualFriendClick(friendRecord.id)}
							onContextMenu={(event) => handleMutualFriendContextMenu(event, friendRecord)}
							isContextMenuOpen={isContextMenuOpenFor}
							data-flx="user.user-profile-modal.render-mutual-friends-list.mutual-friend-item.mutual-friend-click"
						/>
					);
				})}
				{mutualFriends.length === 0 && (
					<div
						className={userProfileModalStyles.emptyState}
						data-flx="user.user-profile-modal.render-mutual-friends-list.div--2"
					>
						<UsersThreeIcon
							className={userProfileModalStyles.emptyStateIcon}
							data-flx="user.user-profile-modal.render-mutual-friends-list.users-three-icon"
						/>
						<Trans>No mutual friends found.</Trans>
					</div>
				)}
			</div>
		);
		const renderMutualCommunitiesGroupsList = () => (
			<div
				className={userProfileModalStyles.mutualFriendsList}
				data-flx="user.user-profile-modal.render-mutual-communities-groups-list.div"
			>
				{mutualGroups.map((group) => (
					<MutualGroupItem
						key={group.id}
						group={group}
						onClick={() => handleGroupClick(group)}
						onContextMenu={(event) => handleGroupContextMenu(event, group)}
						isContextMenuOpen={isContextMenuOpenFor}
						data-flx="user.user-profile-modal.render-mutual-communities-groups-list.mutual-group-item.group-click"
					/>
				))}
				{mutualGroups.length > 0 && mutualCommunityDisplayItems.length > 0 && (
					<div
						className={userProfileModalStyles.mutualSectionDivider}
						data-flx="user.user-profile-modal.render-mutual-communities-groups-list.section-divider"
					/>
				)}
				{mutualCommunityDisplayItems.map(({guild, nick}) => (
					<MutualGuildItem
						key={guild.id}
						guild={guild}
						nick={nick}
						onClick={() => handleGuildClick(guild)}
						onContextMenu={(event) => handleGuildContextMenu(event, guild)}
						isContextMenuOpen={isContextMenuOpenFor}
						data-flx="user.user-profile-modal.render-mutual-communities-groups-list.mutual-guild-item.guild-click"
					/>
				))}
				{mutualCommunitiesGroupsCount === 0 && (
					<div
						className={userProfileModalStyles.emptyState}
						data-flx="user.user-profile-modal.render-mutual-communities-groups-list.div--2"
					>
						<UsersThreeIcon
							className={userProfileModalStyles.emptyStateIcon}
							data-flx="user.user-profile-modal.render-mutual-communities-groups-list.users-three-icon"
						/>
						{i18n._(NO_MUTUAL_COMMUNITIES_FOUND_DESCRIPTOR)}
					</div>
				)}
			</div>
		);
		const renderActiveTabContent = () => {
			switch (activeTab) {
				case 'overview':
					return (
						<ProfileContent
							profile={profile}
							user={user}
							userNote={userNote}
							autoFocusNote={autoFocusNote}
							noteRef={noteRef}
							data-flx="user.user-profile-modal.render-active-tab-content.profile-content"
						/>
					);
				case 'mutual_friends':
					return showMutualFriendsTab ? renderMutualFriendsList() : renderMutualCommunitiesGroupsList();
				case 'mutual_communities_groups':
					return renderMutualCommunitiesGroupsList();
			}
		};
		return (
			<div className={userProfileModalStyles.contentContainer} data-flx="user.user-profile-modal.profile-body.div">
				<UserInfo
					user={user}
					profile={profile}
					guildId={profile.guildId ?? undefined}
					showProfileDataWarning={showProfileDataWarning}
					data-flx="user.user-profile-modal.profile-body.user-info"
				/>
				{!isCurrentUser ? (
					<div
						ref={tabsWrapperRef}
						className={userProfileModalStyles.tabsWrapper}
						data-flx="user.user-profile-modal.profile-body.div--2"
					>
						<Tabs
							activeTab={activeTab}
							onTabChange={handleTabChange}
							tabs={tabs}
							data-flx="user.user-profile-modal.profile-body.tabs"
						/>
					</div>
				) : (
					<div className={userProfileModalStyles.separator} data-flx="user.user-profile-modal.profile-body.div--3" />
				)}
				<div
					className={userProfileModalStyles.profileContentWrapper}
					data-flx="user.user-profile-modal.profile-body.div--4"
				>
					<Scroller
						className={userProfileModalStyles.scrollerFullHeight}
						key="user-profile-modal-content-scroller"
						data-flx="user.user-profile-modal.profile-body.scroller"
					>
						{renderActiveTabContent()}
					</Scroller>
				</div>
			</div>
		);
	},
);

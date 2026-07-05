// SPDX-License-Identifier: AGPL-3.0-or-later

import {
	SettingsTabContainer,
	SettingsTabContent,
	SettingsTabSection,
} from '@app/features/app/components/dialogs/shared/SettingsTabLayout';
import {GroupDMAvatar} from '@app/features/app/components/shared/GroupDMAvatar';
import {getStatusTypeLabel} from '@app/features/app/constants/AppConstants';
import {Channel} from '@app/features/channel/models/Channel';
import {AvatarStack} from '@app/features/ui/avatars/AvatarStack';
import {MentionBadge} from '@app/features/ui/components/MentionBadge';
import {MockAvatar} from '@app/features/ui/components/MockAvatar';
import {SubsectionTitle} from '@app/features/user/components/modals/tabs/component_gallery_tab/ComponentGalleryTabSubsectionTitle';
import styles from '@app/features/user/components/modals/tabs/component_gallery_tab/IndicatorsTab.module.css';
import {ChannelTypes} from '@fluxer/constants/src/ChannelConstants';
import {StatusTypes} from '@fluxer/constants/src/StatusConstants';
import type {UserPartial} from '@fluxer/schema/src/domains/user/UserResponseSchemas';
import {Trans, useLingui} from '@lingui/react/macro';
import type React from 'react';
import {useMemo} from 'react';

const AVATAR_SIZES_WITH_STATUS: Array<16 | 24 | 32 | 36 | 40 | 48 | 80> = [16, 24, 32, 36, 40, 48, 80];
const AVATAR_STATUSES: Array<string> = [
	StatusTypes.ONLINE,
	StatusTypes.IDLE,
	StatusTypes.DND,
	StatusTypes.INVISIBLE,
	StatusTypes.OFFLINE,
];
const createMockRecipient = (id: string): UserPartial => ({
	id,
	username: id,
	discriminator: '0000',
	global_name: null,
	avatar: null,
	avatar_color: null,
	flags: 0,
});
const createMockGroupDMChannel = (id: string, recipientIds: Array<string>): Channel =>
	new Channel({
		id,
		type: ChannelTypes.GROUP_DM,
		recipients: recipientIds.map(createMockRecipient),
	});
const getMockGroupDMChannels = (): Array<Channel> => [
	createMockGroupDMChannel('1000000000000000001', ['1000000000000000002', '1000000000000000003']),
	createMockGroupDMChannel('1000000000000000004', [
		'1000000000000000005',
		'1000000000000000006',
		'1000000000000000007',
	]),
];
export const IndicatorsTab: React.FC = () => {
	const {i18n} = useLingui();
	const mockGroupDMChannels = useMemo(() => getMockGroupDMChannels(), []);
	return (
		<SettingsTabContainer data-flx="user.component-gallery-tab.indicators-tab.settings-tab-container">
			<SettingsTabContent data-flx="user.component-gallery-tab.indicators-tab.settings-tab-content">
				<SettingsTabSection
					title={<Trans>Status indicators</Trans>}
					description={
						<Trans>
							Visual indicators showing user status, rendered using the same masked status badges as avatars: online,
							idle, do not disturb, invisible, and offline.
						</Trans>
					}
					data-flx="user.component-gallery-tab.indicators-tab.settings-tab-section"
				>
					<SubsectionTitle data-flx="user.component-gallery-tab.indicators-tab.subsection-title">
						<Trans>Single user (all statuses)</Trans>
					</SubsectionTitle>
					<div className={styles.itemsWrapper} data-flx="user.component-gallery-tab.indicators-tab.items-wrapper">
						{AVATAR_STATUSES.map((status) => (
							<div
								key={status}
								className={styles.avatarGroup}
								data-flx="user.component-gallery-tab.indicators-tab.avatar-group"
							>
								<MockAvatar
									size={40}
									status={status}
									data-flx="user.component-gallery-tab.indicators-tab.mock-avatar"
								/>
								<span
									className={styles.itemTextTertiary}
									data-flx="user.component-gallery-tab.indicators-tab.item-text-tertiary"
								>
									{getStatusTypeLabel(i18n, status)}
								</span>
							</div>
						))}
					</div>
					<SubsectionTitle data-flx="user.component-gallery-tab.indicators-tab.subsection-title--2">
						<Trans>Mobile online status on avatars</Trans>
					</SubsectionTitle>
					<div className={styles.itemsWrapper} data-flx="user.component-gallery-tab.indicators-tab.items-wrapper--2">
						{AVATAR_SIZES_WITH_STATUS.map((size) => (
							<div
								key={`mobile-avatar-size-${size}`}
								className={styles.avatarGroup}
								data-flx="user.component-gallery-tab.indicators-tab.avatar-group--2"
							>
								<MockAvatar
									size={size}
									status={StatusTypes.ONLINE}
									isMobileStatus
									data-flx="user.component-gallery-tab.indicators-tab.mock-avatar--2"
								/>
								<span
									className={styles.itemTextTertiary}
									data-flx="user.component-gallery-tab.indicators-tab.item-text-tertiary--2"
								>
									{size}px
								</span>
							</div>
						))}
					</div>
					<SubsectionTitle data-flx="user.component-gallery-tab.indicators-tab.subsection-title--3">
						<Trans>Different sizes (status supported)</Trans>
					</SubsectionTitle>
					<div className={styles.itemsWrapper} data-flx="user.component-gallery-tab.indicators-tab.items-wrapper--3">
						{AVATAR_SIZES_WITH_STATUS.map((size) => (
							<div
								key={size}
								className={styles.avatarGroup}
								data-flx="user.component-gallery-tab.indicators-tab.avatar-group--3"
							>
								<MockAvatar
									size={size}
									status={StatusTypes.ONLINE}
									data-flx="user.component-gallery-tab.indicators-tab.mock-avatar--3"
								/>
								<span
									className={styles.itemTextTertiary}
									data-flx="user.component-gallery-tab.indicators-tab.item-text-tertiary--3"
								>
									{size}px
								</span>
							</div>
						))}
					</div>
				</SettingsTabSection>
				<SettingsTabSection
					title={<Trans>Mention badges</Trans>}
					description={<Trans>Notification badges showing unread mention counts in different sizes.</Trans>}
					data-flx="user.component-gallery-tab.indicators-tab.settings-tab-section--2"
				>
					<SubsectionTitle data-flx="user.component-gallery-tab.indicators-tab.subsection-title--4">
						<Trans>Medium size (default)</Trans>
					</SubsectionTitle>
					<div className={styles.badgesWrapper} data-flx="user.component-gallery-tab.indicators-tab.badges-wrapper">
						<MentionBadge mentionCount={1} data-flx="user.component-gallery-tab.indicators-tab.mention-badge" />
						<MentionBadge mentionCount={5} data-flx="user.component-gallery-tab.indicators-tab.mention-badge--2" />
						<MentionBadge mentionCount={12} data-flx="user.component-gallery-tab.indicators-tab.mention-badge--3" />
						<MentionBadge mentionCount={99} data-flx="user.component-gallery-tab.indicators-tab.mention-badge--4" />
						<MentionBadge mentionCount={150} data-flx="user.component-gallery-tab.indicators-tab.mention-badge--5" />
						<MentionBadge mentionCount={1000} data-flx="user.component-gallery-tab.indicators-tab.mention-badge--6" />
						<MentionBadge mentionCount={9999} data-flx="user.component-gallery-tab.indicators-tab.mention-badge--7" />
					</div>
					<SubsectionTitle data-flx="user.component-gallery-tab.indicators-tab.subsection-title--5">
						<Trans>Small size</Trans>
					</SubsectionTitle>
					<div className={styles.badgesWrapper} data-flx="user.component-gallery-tab.indicators-tab.badges-wrapper--2">
						<MentionBadge
							mentionCount={1}
							size="small"
							data-flx="user.component-gallery-tab.indicators-tab.mention-badge--8"
						/>
						<MentionBadge
							mentionCount={5}
							size="small"
							data-flx="user.component-gallery-tab.indicators-tab.mention-badge--9"
						/>
						<MentionBadge
							mentionCount={12}
							size="small"
							data-flx="user.component-gallery-tab.indicators-tab.mention-badge--10"
						/>
						<MentionBadge
							mentionCount={99}
							size="small"
							data-flx="user.component-gallery-tab.indicators-tab.mention-badge--11"
						/>
						<MentionBadge
							mentionCount={150}
							size="small"
							data-flx="user.component-gallery-tab.indicators-tab.mention-badge--12"
						/>
						<MentionBadge
							mentionCount={1000}
							size="small"
							data-flx="user.component-gallery-tab.indicators-tab.mention-badge--13"
						/>
					</div>
				</SettingsTabSection>
				<SettingsTabSection
					title={<Trans>Mock avatars</Trans>}
					description={<Trans>Mock user avatars in various sizes and all status permutations.</Trans>}
					data-flx="user.component-gallery-tab.indicators-tab.settings-tab-section--3"
				>
					<SubsectionTitle data-flx="user.component-gallery-tab.indicators-tab.subsection-title--6">
						<Trans>Different sizes (online)</Trans>
					</SubsectionTitle>
					<div className={styles.itemsWrapper} data-flx="user.component-gallery-tab.indicators-tab.items-wrapper--4">
						{AVATAR_SIZES_WITH_STATUS.map((size) => (
							<div
								key={size}
								className={styles.avatarGroup}
								data-flx="user.component-gallery-tab.indicators-tab.avatar-group--4"
							>
								<MockAvatar
									size={size}
									status={StatusTypes.ONLINE}
									data-flx="user.component-gallery-tab.indicators-tab.mock-avatar--4"
								/>
								<span
									className={styles.itemTextTertiary}
									data-flx="user.component-gallery-tab.indicators-tab.item-text-tertiary--4"
								>
									{size}px
								</span>
							</div>
						))}
					</div>
					<SubsectionTitle data-flx="user.component-gallery-tab.indicators-tab.subsection-title--7">
						<Trans>All status types</Trans>
					</SubsectionTitle>
					<div className={styles.itemsWrapper} data-flx="user.component-gallery-tab.indicators-tab.items-wrapper--5">
						{AVATAR_STATUSES.map((status) => (
							<div
								key={status}
								className={styles.avatarGroup}
								data-flx="user.component-gallery-tab.indicators-tab.avatar-group--5"
							>
								<MockAvatar
									size={48}
									status={status}
									data-flx="user.component-gallery-tab.indicators-tab.mock-avatar--5"
								/>
								<span
									className={styles.itemTextTertiary}
									data-flx="user.component-gallery-tab.indicators-tab.item-text-tertiary--5"
								>
									{getStatusTypeLabel(i18n, status)}
								</span>
							</div>
						))}
					</div>
					<SubsectionTitle data-flx="user.component-gallery-tab.indicators-tab.subsection-title--8">
						<Trans>Typing state</Trans>
					</SubsectionTitle>
					<div className={styles.itemsWrapper} data-flx="user.component-gallery-tab.indicators-tab.items-wrapper--6">
						{AVATAR_STATUSES.map((status) => (
							<div
								key={status}
								className={styles.avatarGroup}
								data-flx="user.component-gallery-tab.indicators-tab.avatar-group--6"
							>
								<MockAvatar
									size={48}
									status={status}
									isTyping
									data-flx="user.component-gallery-tab.indicators-tab.mock-avatar--6"
								/>
								<span
									className={styles.itemTextTertiary}
									data-flx="user.component-gallery-tab.indicators-tab.item-text-tertiary--6"
								>
									{getStatusTypeLabel(i18n, status)}
								</span>
							</div>
						))}
					</div>
				</SettingsTabSection>
				<SettingsTabSection
					title={<Trans>Group DM avatars</Trans>}
					description={
						<Trans>
							Group DM avatars using the same status masks as regular avatars, including stacked layouts and typing
							states.
						</Trans>
					}
					data-flx="user.component-gallery-tab.indicators-tab.settings-tab-section--4"
				>
					<SubsectionTitle data-flx="user.component-gallery-tab.indicators-tab.subsection-title--9">
						<Trans>Different sizes & member counts</Trans>
					</SubsectionTitle>
					<div className={styles.itemsWrapper} data-flx="user.component-gallery-tab.indicators-tab.items-wrapper--7">
						<div className={styles.avatarGroup} data-flx="user.component-gallery-tab.indicators-tab.avatar-group--7">
							<GroupDMAvatar
								channel={mockGroupDMChannels[0]}
								size={32}
								data-flx="user.component-gallery-tab.indicators-tab.group-dm-avatar"
							/>
							<span
								className={styles.itemTextTertiary}
								data-flx="user.component-gallery-tab.indicators-tab.item-text-tertiary--7"
							>
								<Trans>32px, 2 members</Trans>
							</span>
						</div>
						<div className={styles.avatarGroup} data-flx="user.component-gallery-tab.indicators-tab.avatar-group--8">
							<GroupDMAvatar
								channel={mockGroupDMChannels[1]}
								size={40}
								data-flx="user.component-gallery-tab.indicators-tab.group-dm-avatar--2"
							/>
							<span
								className={styles.itemTextTertiary}
								data-flx="user.component-gallery-tab.indicators-tab.item-text-tertiary--8"
							>
								<Trans>40px, 3 members</Trans>
							</span>
						</div>
					</div>
					<SubsectionTitle data-flx="user.component-gallery-tab.indicators-tab.subsection-title--10">
						<Trans>Group online status</Trans>
					</SubsectionTitle>
					<div className={styles.itemsWrapper} data-flx="user.component-gallery-tab.indicators-tab.items-wrapper--8">
						<div className={styles.avatarGroup} data-flx="user.component-gallery-tab.indicators-tab.avatar-group--9">
							<GroupDMAvatar
								channel={mockGroupDMChannels[0]}
								size={32}
								statusOverride={StatusTypes.ONLINE}
								data-flx="user.component-gallery-tab.indicators-tab.group-dm-avatar--3"
							/>
							<span
								className={styles.itemTextTertiary}
								data-flx="user.component-gallery-tab.indicators-tab.item-text-tertiary--9"
							>
								<Trans>2 members (online)</Trans>
							</span>
						</div>
						<div className={styles.avatarGroup} data-flx="user.component-gallery-tab.indicators-tab.avatar-group--10">
							<GroupDMAvatar
								channel={mockGroupDMChannels[1]}
								size={40}
								statusOverride={StatusTypes.ONLINE}
								data-flx="user.component-gallery-tab.indicators-tab.group-dm-avatar--4"
							/>
							<span
								className={styles.itemTextTertiary}
								data-flx="user.component-gallery-tab.indicators-tab.item-text-tertiary--10"
							>
								<Trans>3 members (online)</Trans>
							</span>
						</div>
					</div>
					<SubsectionTitle data-flx="user.component-gallery-tab.indicators-tab.subsection-title--11">
						<Trans>Group typing states</Trans>
					</SubsectionTitle>
					<div className={styles.itemsWrapper} data-flx="user.component-gallery-tab.indicators-tab.items-wrapper--9">
						<div className={styles.avatarGroup} data-flx="user.component-gallery-tab.indicators-tab.avatar-group--11">
							<GroupDMAvatar
								channel={mockGroupDMChannels[0]}
								size={32}
								statusOverride={StatusTypes.ONLINE}
								isTyping
								data-flx="user.component-gallery-tab.indicators-tab.group-dm-avatar--5"
							/>
							<span
								className={styles.itemTextTertiary}
								data-flx="user.component-gallery-tab.indicators-tab.item-text-tertiary--11"
							>
								<Trans>2 members (typing)</Trans>
							</span>
						</div>
						<div className={styles.avatarGroup} data-flx="user.component-gallery-tab.indicators-tab.avatar-group--12">
							<GroupDMAvatar
								channel={mockGroupDMChannels[1]}
								size={40}
								statusOverride={StatusTypes.ONLINE}
								isTyping
								data-flx="user.component-gallery-tab.indicators-tab.group-dm-avatar--6"
							/>
							<span
								className={styles.itemTextTertiary}
								data-flx="user.component-gallery-tab.indicators-tab.item-text-tertiary--12"
							>
								<Trans>3 members (typing)</Trans>
							</span>
						</div>
					</div>
				</SettingsTabSection>
				<SettingsTabSection
					title={<Trans>Avatar stacks</Trans>}
					description={<Trans>Overlapping avatar groups showing multiple users with automatic overflow counts.</Trans>}
					data-flx="user.component-gallery-tab.indicators-tab.settings-tab-section--5"
				>
					<SubsectionTitle data-flx="user.component-gallery-tab.indicators-tab.subsection-title--12">
						<Trans>Different sizes</Trans>
					</SubsectionTitle>
					<div className={styles.stacksWrapper} data-flx="user.component-gallery-tab.indicators-tab.stacks-wrapper">
						<div className={styles.stackItem} data-flx="user.component-gallery-tab.indicators-tab.stack-item">
							<AvatarStack size={24} data-flx="user.component-gallery-tab.indicators-tab.avatar-stack">
								{[1, 2, 3, 4].map((i) => (
									<MockAvatar
										key={i}
										size={24}
										userTag={`User ${i}`}
										data-flx="user.component-gallery-tab.indicators-tab.mock-avatar--7"
									/>
								))}
							</AvatarStack>
							<span
								className={styles.itemTextTertiary}
								data-flx="user.component-gallery-tab.indicators-tab.item-text-tertiary--13"
							>
								24px
							</span>
						</div>
						<div className={styles.stackItem} data-flx="user.component-gallery-tab.indicators-tab.stack-item--2">
							<AvatarStack size={32} data-flx="user.component-gallery-tab.indicators-tab.avatar-stack--2">
								{[1, 2, 3, 4].map((i) => (
									<MockAvatar
										key={i}
										size={32}
										userTag={`User ${i}`}
										data-flx="user.component-gallery-tab.indicators-tab.mock-avatar--8"
									/>
								))}
							</AvatarStack>
							<span
								className={styles.itemTextTertiary}
								data-flx="user.component-gallery-tab.indicators-tab.item-text-tertiary--14"
							>
								32px
							</span>
						</div>
						<div className={styles.stackItem} data-flx="user.component-gallery-tab.indicators-tab.stack-item--3">
							<AvatarStack size={40} data-flx="user.component-gallery-tab.indicators-tab.avatar-stack--3">
								{[1, 2, 3, 4].map((i) => (
									<MockAvatar
										key={i}
										size={40}
										userTag={`User ${i}`}
										data-flx="user.component-gallery-tab.indicators-tab.mock-avatar--9"
									/>
								))}
							</AvatarStack>
							<span
								className={styles.itemTextTertiary}
								data-flx="user.component-gallery-tab.indicators-tab.item-text-tertiary--15"
							>
								40px
							</span>
						</div>
					</div>
					<SubsectionTitle data-flx="user.component-gallery-tab.indicators-tab.subsection-title--13">
						<Trans>Max visible count</Trans>
					</SubsectionTitle>
					<div className={styles.stacksWrapper} data-flx="user.component-gallery-tab.indicators-tab.stacks-wrapper--2">
						<div className={styles.stackItem} data-flx="user.component-gallery-tab.indicators-tab.stack-item--4">
							<AvatarStack
								size={32}
								maxVisible={3}
								data-flx="user.component-gallery-tab.indicators-tab.avatar-stack--4"
							>
								{[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
									<MockAvatar
										key={i}
										size={32}
										userTag={`User ${i}`}
										data-flx="user.component-gallery-tab.indicators-tab.mock-avatar--10"
									/>
								))}
							</AvatarStack>
							<span
								className={styles.itemTextTertiary}
								data-flx="user.component-gallery-tab.indicators-tab.item-text-tertiary--16"
							>
								<Trans>Show max 3 (+5 badge)</Trans>
							</span>
						</div>
						<div className={styles.stackItem} data-flx="user.component-gallery-tab.indicators-tab.stack-item--5">
							<AvatarStack
								size={32}
								maxVisible={5}
								data-flx="user.component-gallery-tab.indicators-tab.avatar-stack--5"
							>
								{[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => (
									<MockAvatar
										key={i}
										size={32}
										userTag={`User ${i}`}
										data-flx="user.component-gallery-tab.indicators-tab.mock-avatar--11"
									/>
								))}
							</AvatarStack>
							<span
								className={styles.itemTextTertiary}
								data-flx="user.component-gallery-tab.indicators-tab.item-text-tertiary--17"
							>
								<Trans>Show max 5 (+5 badge)</Trans>
							</span>
						</div>
					</div>
				</SettingsTabSection>
			</SettingsTabContent>
		</SettingsTabContainer>
	);
};

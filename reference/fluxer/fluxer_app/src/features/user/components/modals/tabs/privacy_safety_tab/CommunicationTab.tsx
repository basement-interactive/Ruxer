// SPDX-License-Identifier: AGPL-3.0-or-later

import {SettingsTabSection} from '@app/features/app/components/dialogs/shared/SettingsTabLayout';
import {
	COMMUNITY_MEMBERS_DESCRIPTOR,
	FRIENDS_OF_FRIENDS_DESCRIPTOR,
} from '@app/features/i18n/utils/CommonMessageDescriptors';
import type {ComboboxOption} from '@app/features/ui/components/form/FormCombobox';
import {Switch} from '@app/features/ui/components/form/FormSwitch';
import * as UserSettingsCommands from '@app/features/user/commands/UserSettingsCommands';
import {CompactComboboxRow} from '@app/features/user/components/modals/tabs/components/CompactComboboxRow';
import UserSettings from '@app/features/user/state/UserSettings';
import {GroupDmAddPermissionFlags, IncomingCallFlags} from '@fluxer/constants/src/UserConstants';
import {msg} from '@lingui/core/macro';
import {Trans, useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import type React from 'react';

const INCOMING_CALL_NOBODY_OPTION_DESCRIPTOR = msg({
	message: 'Block all incoming calls',
	comment: 'Privacy > Communication: select option blocking every incoming call.',
});
const INCOMING_CALL_FRIENDS_ONLY_OPTION_DESCRIPTOR = msg({
	message: 'Only friends can call you (recommended)',
	comment: 'Privacy > Communication: select option allowing only friends to call.',
});
const INCOMING_CALL_CUSTOM_OPTION_DESCRIPTOR = msg({
	message: 'Friends and selected groups can call you',
	comment: 'Privacy > Communication: select option for the custom incoming call permission tier.',
});
const INCOMING_CALL_EVERYONE_OPTION_DESCRIPTOR = msg({
	message: 'Anyone can call you, including strangers',
	comment: 'Privacy > Communication: select option allowing anyone to call.',
});
const GROUP_DM_ADD_NOBODY_OPTION_DESCRIPTOR = msg({
	message: 'No one can add you to group chats without asking',
	comment: 'Privacy > Communication: select option blocking group chat adds unless the user accepts an invite.',
});
const GROUP_DM_ADD_FRIENDS_ONLY_OPTION_DESCRIPTOR = msg({
	message: 'Only friends can add you without asking (recommended)',
	comment: 'Privacy > Communication: select option allowing only friends to add the user to group chats.',
});
const GROUP_DM_ADD_CUSTOM_OPTION_DESCRIPTOR = msg({
	message: 'Friends and selected groups can add you without asking',
	comment: 'Privacy > Communication: select option for the custom group chat add permission tier.',
});
const GROUP_DM_ADD_EVERYONE_OPTION_DESCRIPTOR = msg({
	message: 'Anyone can add you to group chats',
	comment: 'Privacy > Communication: select option allowing anyone to add the user to group chats.',
});
type CommunicationPermissionValue = 'nobody' | 'friends_only' | 'everyone' | 'custom';
export const CommunicationTabContent: React.FC = observer(() => {
	const {i18n} = useLingui();
	const incomingCallFlags = UserSettings.getIncomingCallFlags();
	const groupDmAddPermissionFlags = UserSettings.getGroupDmAddPermissionFlags();
	const hasCallFlag = (flag: number) => (incomingCallFlags & flag) === flag;
	const hasGroupDmAddFlag = (flag: number) => (groupDmAddPermissionFlags & flag) === flag;
	const getIncomingCallBaseValue = (): CommunicationPermissionValue => {
		if (hasCallFlag(IncomingCallFlags.NOBODY)) return 'nobody';
		if (hasCallFlag(IncomingCallFlags.EVERYONE)) return 'everyone';
		if (hasCallFlag(IncomingCallFlags.FRIENDS_ONLY)) return 'friends_only';
		return 'custom';
	};
	const handleIncomingCallBaseChange = async (value: CommunicationPermissionValue) => {
		let newFlags = 0;
		if (value === 'nobody') {
			newFlags = IncomingCallFlags.NOBODY;
		} else if (value === 'friends_only') {
			newFlags = IncomingCallFlags.FRIENDS_ONLY;
		} else if (value === 'everyone') {
			newFlags = IncomingCallFlags.EVERYONE;
		} else {
			newFlags = incomingCallFlags & (IncomingCallFlags.FRIENDS_OF_FRIENDS | IncomingCallFlags.GUILD_MEMBERS);
			if (newFlags === 0) {
				newFlags = IncomingCallFlags.FRIENDS_OF_FRIENDS;
			}
		}
		await UserSettingsCommands.update({incomingCallFlags: newFlags});
	};
	const handleIncomingCallAdditiveToggle = async (flag: number, value: boolean) => {
		let newFlags = incomingCallFlags;
		newFlags &= ~IncomingCallFlags.NOBODY;
		newFlags &= ~IncomingCallFlags.FRIENDS_ONLY;
		newFlags &= ~IncomingCallFlags.EVERYONE;
		if (value) {
			newFlags |= flag;
		} else {
			newFlags &= ~flag;
		}
		if (newFlags === 0) {
			newFlags = IncomingCallFlags.FRIENDS_ONLY;
		}
		await UserSettingsCommands.update({incomingCallFlags: newFlags});
	};
	const handleIncomingCallModifierToggle = async (flag: number, value: boolean) => {
		let newFlags = incomingCallFlags;
		if (value) {
			newFlags |= flag;
		} else {
			newFlags &= ~flag;
		}
		await UserSettingsCommands.update({incomingCallFlags: newFlags});
	};
	const getGroupDmAddBaseValue = (): CommunicationPermissionValue => {
		if (hasGroupDmAddFlag(GroupDmAddPermissionFlags.NOBODY)) return 'nobody';
		if (hasGroupDmAddFlag(GroupDmAddPermissionFlags.EVERYONE)) return 'everyone';
		if (hasGroupDmAddFlag(GroupDmAddPermissionFlags.FRIENDS_ONLY)) return 'friends_only';
		return 'custom';
	};
	const handleGroupDmAddBaseChange = async (value: CommunicationPermissionValue) => {
		let newFlags = 0;
		if (value === 'nobody') {
			newFlags = GroupDmAddPermissionFlags.NOBODY;
		} else if (value === 'friends_only') {
			newFlags = GroupDmAddPermissionFlags.FRIENDS_ONLY;
		} else if (value === 'everyone') {
			newFlags = GroupDmAddPermissionFlags.EVERYONE;
		} else {
			newFlags =
				groupDmAddPermissionFlags &
				(GroupDmAddPermissionFlags.FRIENDS_OF_FRIENDS | GroupDmAddPermissionFlags.GUILD_MEMBERS);
			if (newFlags === 0) {
				newFlags = GroupDmAddPermissionFlags.FRIENDS_OF_FRIENDS;
			}
		}
		await UserSettingsCommands.update({groupDmAddPermissionFlags: newFlags});
	};
	const handleGroupDmAddAdditiveToggle = async (flag: number, value: boolean) => {
		let newFlags = groupDmAddPermissionFlags;
		newFlags &= ~GroupDmAddPermissionFlags.NOBODY;
		newFlags &= ~GroupDmAddPermissionFlags.FRIENDS_ONLY;
		newFlags &= ~GroupDmAddPermissionFlags.EVERYONE;
		if (value) {
			newFlags |= flag;
		} else {
			newFlags &= ~flag;
		}
		if (newFlags === 0) {
			newFlags = GroupDmAddPermissionFlags.FRIENDS_ONLY;
		}
		await UserSettingsCommands.update({groupDmAddPermissionFlags: newFlags});
	};
	const incomingCallOptions: Array<ComboboxOption<CommunicationPermissionValue>> = [
		{
			value: 'nobody',
			label: i18n._(INCOMING_CALL_NOBODY_OPTION_DESCRIPTOR),
		},
		{
			value: 'friends_only',
			label: i18n._(INCOMING_CALL_FRIENDS_ONLY_OPTION_DESCRIPTOR),
		},
		{
			value: 'custom',
			label: i18n._(INCOMING_CALL_CUSTOM_OPTION_DESCRIPTOR),
		},
		{
			value: 'everyone',
			label: i18n._(INCOMING_CALL_EVERYONE_OPTION_DESCRIPTOR),
		},
	];
	const groupDmAddOptions: Array<ComboboxOption<CommunicationPermissionValue>> = [
		{
			value: 'nobody',
			label: i18n._(GROUP_DM_ADD_NOBODY_OPTION_DESCRIPTOR),
		},
		{
			value: 'friends_only',
			label: i18n._(GROUP_DM_ADD_FRIENDS_ONLY_OPTION_DESCRIPTOR),
		},
		{
			value: 'custom',
			label: i18n._(GROUP_DM_ADD_CUSTOM_OPTION_DESCRIPTOR),
		},
		{
			value: 'everyone',
			label: i18n._(GROUP_DM_ADD_EVERYONE_OPTION_DESCRIPTOR),
		},
	];
	return (
		<>
			<SettingsTabSection
				title={<Trans>Incoming calls</Trans>}
				data-flx="user.privacy-safety-tab.communication-tab.communication-tab-content.settings-tab-section"
			>
				<CompactComboboxRow<CommunicationPermissionValue>
					label={<Trans>Allowed callers</Trans>}
					value={getIncomingCallBaseValue()}
					onChange={handleIncomingCallBaseChange}
					options={incomingCallOptions}
					isSearchable={false}
					controlWidth="wide"
					dataFlx="user.privacy-safety-tab.communication-tab.communication-tab-content.select.incoming-call-base-change"
					data-flx="user.privacy-safety-tab.communication-tab.communication-tab-content.compact-combobox-row.incoming-call-base-change"
				/>
				{getIncomingCallBaseValue() === 'custom' && (
					<>
						<Switch
							label={i18n._(FRIENDS_OF_FRIENDS_DESCRIPTOR)}
							value={hasCallFlag(IncomingCallFlags.FRIENDS_OF_FRIENDS)}
							onChange={(value) => handleIncomingCallAdditiveToggle(IncomingCallFlags.FRIENDS_OF_FRIENDS, value)}
							data-flx="user.privacy-safety-tab.communication-tab.communication-tab-content.switch.incoming-call-additive-toggle"
						/>
						<Switch
							label={i18n._(COMMUNITY_MEMBERS_DESCRIPTOR)}
							value={hasCallFlag(IncomingCallFlags.GUILD_MEMBERS)}
							onChange={(value) => handleIncomingCallAdditiveToggle(IncomingCallFlags.GUILD_MEMBERS, value)}
							data-flx="user.privacy-safety-tab.communication-tab.communication-tab-content.switch.incoming-call-additive-toggle--2"
						/>
					</>
				)}
				{getIncomingCallBaseValue() !== 'nobody' && (
					<Switch
						label={<Trans>Silent calls from everyone</Trans>}
						value={hasCallFlag(IncomingCallFlags.SILENT_EVERYONE)}
						onChange={(value) => handleIncomingCallModifierToggle(IncomingCallFlags.SILENT_EVERYONE, value)}
						data-flx="user.privacy-safety-tab.communication-tab.communication-tab-content.switch.incoming-call-modifier-toggle"
					/>
				)}
			</SettingsTabSection>
			<SettingsTabSection
				title={<Trans>Who can add you to group chats</Trans>}
				data-flx="user.privacy-safety-tab.communication-tab.communication-tab-content.settings-tab-section--2"
			>
				<CompactComboboxRow<CommunicationPermissionValue>
					label={<Trans>Allowed invites</Trans>}
					value={getGroupDmAddBaseValue()}
					onChange={handleGroupDmAddBaseChange}
					options={groupDmAddOptions}
					isSearchable={false}
					controlWidth="wide"
					dataFlx="user.privacy-safety-tab.communication-tab.communication-tab-content.select.group-dm-add-base-change"
					data-flx="user.privacy-safety-tab.communication-tab.communication-tab-content.compact-combobox-row.group-dm-add-base-change"
				/>
				{getGroupDmAddBaseValue() === 'custom' && (
					<>
						<Switch
							label={i18n._(FRIENDS_OF_FRIENDS_DESCRIPTOR)}
							value={hasGroupDmAddFlag(GroupDmAddPermissionFlags.FRIENDS_OF_FRIENDS)}
							onChange={(value) => handleGroupDmAddAdditiveToggle(GroupDmAddPermissionFlags.FRIENDS_OF_FRIENDS, value)}
							data-flx="user.privacy-safety-tab.communication-tab.communication-tab-content.switch.group-dm-add-additive-toggle"
						/>
						<Switch
							label={i18n._(COMMUNITY_MEMBERS_DESCRIPTOR)}
							value={hasGroupDmAddFlag(GroupDmAddPermissionFlags.GUILD_MEMBERS)}
							onChange={(value) => handleGroupDmAddAdditiveToggle(GroupDmAddPermissionFlags.GUILD_MEMBERS, value)}
							data-flx="user.privacy-safety-tab.communication-tab.communication-tab-content.switch.group-dm-add-additive-toggle--2"
						/>
					</>
				)}
			</SettingsTabSection>
		</>
	);
});

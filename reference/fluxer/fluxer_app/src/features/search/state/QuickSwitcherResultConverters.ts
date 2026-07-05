// SPDX-License-Identifier: AGPL-3.0-or-later

import type {Channel} from '@app/features/channel/models/Channel';
import {
	COMMUNITIES_DESCRIPTOR,
	FAVORITES_DESCRIPTOR,
	SETTINGS_DESCRIPTOR,
} from '@app/features/i18n/utils/CommonMessageDescriptors';
import type {
	Candidate,
	CandidateSets,
	HeaderResult,
	QuickSwitcherExecutableResult,
	QuickSwitcherResult,
} from '@app/features/search/state/QuickSwitcherTypes';
import {FAVORITES_GUILD_ID} from '@fluxer/constants/src/AppConstants';
import {ChannelTypes} from '@fluxer/constants/src/ChannelConstants';
import {QuickSwitcherResultTypes} from '@fluxer/constants/src/QuickSwitcherConstants';
import type {I18n} from '@lingui/core';
import {msg} from '@lingui/core/macro';

const PEOPLE_DESCRIPTOR = msg({
	message: 'People',
	comment: 'Quick switcher section header for user results.',
});
const GROUP_MESSAGES_DESCRIPTOR = msg({
	message: 'Group messages',
	comment: 'Quick switcher section header for group DM results.',
});
const TEXT_CHANNELS_DESCRIPTOR = msg({
	message: 'Text channels',
	comment: 'Quick switcher section header for text channel results.',
});
const VOICE_CHANNELS_DESCRIPTOR = msg({
	message: 'Voice channels',
	comment: 'Quick switcher section header for voice channel results.',
});

export type HeaderTitleType =
	| typeof QuickSwitcherResultTypes.USER
	| typeof QuickSwitcherResultTypes.GROUP_DM
	| typeof QuickSwitcherResultTypes.TEXT_CHANNEL
	| typeof QuickSwitcherResultTypes.VOICE_CHANNEL
	| typeof QuickSwitcherResultTypes.GUILD
	| typeof QuickSwitcherResultTypes.VIRTUAL_GUILD
	| typeof QuickSwitcherResultTypes.SETTINGS;

function assertNever(value: never): never {
	throw new Error(`Unexpected quick switcher type: ${String(value)}`);
}

export function candidateToResult(
	candidate: Candidate,
	i18n: I18n,
	viewContext?: string,
): QuickSwitcherExecutableResult {
	switch (candidate.type) {
		case QuickSwitcherResultTypes.USER:
			return {
				type: QuickSwitcherResultTypes.USER,
				id: candidate.id,
				title: candidate.title,
				subtitle: candidate.subtitle,
				user: candidate.user,
				dmChannelId: candidate.dmChannelId,
				viewContext,
			};
		case QuickSwitcherResultTypes.GROUP_DM:
			return {
				type: QuickSwitcherResultTypes.GROUP_DM,
				id: candidate.id,
				title: candidate.title,
				subtitle: candidate.subtitle,
				channel: candidate.channel,
				viewContext,
			};
		case QuickSwitcherResultTypes.TEXT_CHANNEL:
		case QuickSwitcherResultTypes.VOICE_CHANNEL: {
			return {
				type: candidate.type,
				id: candidate.id,
				title: candidate.title,
				subtitle: getCandidateSubtitle(candidate.subtitle, i18n, viewContext),
				channel: candidate.channel,
				guild: candidate.guild,
				viewContext,
			};
		}
		case QuickSwitcherResultTypes.GUILD:
			return {
				type: QuickSwitcherResultTypes.GUILD,
				id: candidate.id,
				title: candidate.title,
				subtitle: candidate.subtitle,
				guild: candidate.guild,
			};
		case QuickSwitcherResultTypes.VIRTUAL_GUILD:
			return {
				type: QuickSwitcherResultTypes.VIRTUAL_GUILD,
				id: candidate.id,
				title: candidate.title,
				subtitle: candidate.subtitle,
				virtualGuildType: candidate.virtualGuildType,
			};
		case QuickSwitcherResultTypes.SETTINGS:
			return {
				type: QuickSwitcherResultTypes.SETTINGS,
				id: candidate.id,
				title: candidate.title,
				subtitle: candidate.subtitle,
				settingsTab: candidate.settingsTab,
				settingsSubtab: candidate.settingsSubtab,
			};
		default:
			return assertNever(candidate);
	}
}

export function createHeaderResult(id: string, title: string): HeaderResult {
	return {type: QuickSwitcherResultTypes.HEADER, id, title};
}

function getCandidateSubtitle(subtitle: string | undefined, i18n: I18n, viewContext?: string): string | undefined {
	if (viewContext === FAVORITES_GUILD_ID) {
		return i18n._(FAVORITES_DESCRIPTOR);
	}
	return subtitle;
}

export function getHeaderTitle(type: HeaderTitleType, i18n: I18n): string {
	switch (type) {
		case QuickSwitcherResultTypes.USER:
			return i18n._(PEOPLE_DESCRIPTOR);
		case QuickSwitcherResultTypes.GROUP_DM:
			return i18n._(GROUP_MESSAGES_DESCRIPTOR);
		case QuickSwitcherResultTypes.TEXT_CHANNEL:
			return i18n._(TEXT_CHANNELS_DESCRIPTOR);
		case QuickSwitcherResultTypes.VOICE_CHANNEL:
			return i18n._(VOICE_CHANNELS_DESCRIPTOR);
		case QuickSwitcherResultTypes.GUILD:
		case QuickSwitcherResultTypes.VIRTUAL_GUILD:
			return i18n._(COMMUNITIES_DESCRIPTOR);
		case QuickSwitcherResultTypes.SETTINGS:
			return i18n._(SETTINGS_DESCRIPTOR);
		default:
			return assertNever(type);
	}
}

export function createResultFromChannel(
	channel: Channel,
	sets: CandidateSets,
	i18n: I18n,
	viewContext?: string,
): QuickSwitcherExecutableResult | null {
	switch (channel.type) {
		case ChannelTypes.DM:
		case ChannelTypes.DM_PERSONAL_NOTES: {
			const candidate = sets.userByChannelId.get(channel.id);
			return candidate ? candidateToResult(candidate, i18n, viewContext) : null;
		}
		case ChannelTypes.GROUP_DM: {
			const candidate = sets.groupDMByChannelId.get(channel.id);
			return candidate ? candidateToResult(candidate, i18n, viewContext) : null;
		}
		case ChannelTypes.GUILD_TEXT: {
			const candidate = sets.channelById.get(channel.id);
			if (candidate && candidate.type === QuickSwitcherResultTypes.TEXT_CHANNEL) {
				return candidateToResult(candidate, i18n, viewContext);
			}
			return null;
		}
		case ChannelTypes.GUILD_VOICE: {
			const candidate = sets.channelById.get(channel.id);
			if (candidate && candidate.type === QuickSwitcherResultTypes.VOICE_CHANNEL) {
				return candidateToResult(candidate, i18n, viewContext);
			}
			return null;
		}
		default:
			return null;
	}
}

export function getFirstSelectableIndex(results: ReadonlyArray<QuickSwitcherResult>): number {
	for (let i = 0; i < results.length; i += 1) {
		if (results[i].type !== QuickSwitcherResultTypes.HEADER) {
			return i;
		}
	}
	return -1;
}

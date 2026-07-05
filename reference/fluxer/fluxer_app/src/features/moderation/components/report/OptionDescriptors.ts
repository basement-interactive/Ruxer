// SPDX-License-Identifier: AGPL-3.0-or-later

import type {ReportType} from '@app/features/moderation/components/report/ReportTypes';
import type {MessageDescriptor} from '@lingui/core';
import {msg} from '@lingui/core/macro';

const REPORT_A_MESSAGE_DESCRIPTOR = msg({
	message: 'Report a message',
	comment: 'Report flow target option. Selects reporting a specific chat message. Keep tone plain and neutral.',
});
const REPORT_A_USER_PROFILE_DESCRIPTOR = msg({
	message: 'Report a user profile',
	comment: 'Report flow target option. Selects reporting another user account or profile. Keep tone plain and neutral.',
});
const REPORT_A_COMMUNITY_DESCRIPTOR = msg({
	message: 'Report a community',
	comment:
		'Report flow target option. Selects reporting an entire community (server). Use the localized term for community, not server.',
});
const SELECT_A_CATEGORY_DESCRIPTOR = msg({
	message: 'Select a category',
	comment: 'Placeholder option label for the report category dropdown when no category has been chosen yet.',
});
const HARASSMENT_OR_BULLYING_DESCRIPTOR = msg({
	message: 'Harassment or bullying',
	comment: 'Report category label for messages or users engaged in harassment or bullying. Keep tone plain.',
});
const HATE_SPEECH_DESCRIPTOR = msg({
	message: 'Hate speech',
	comment: 'Report category label for hate speech. Keep tone plain and neutral.',
});
const VIOLENT_OR_GRAPHIC_CONTENT_DESCRIPTOR = msg({
	message: 'Violent or graphic content',
	comment: 'Report category label for violent or graphic content. Keep tone plain and neutral.',
});
const SPAM_OR_SCAM_DESCRIPTOR = msg({
	message: 'Spam or scam',
	comment: 'Report category label for spam or scam messages. Keep tone plain and neutral.',
});
const MATURE_CONTENT_POLICY_VIOLATION_DESCRIPTOR = msg({
	message: 'Mature content policy violation',
	comment: 'Report category label for mature-content policy violations. Keep tone plain and neutral.',
});
const ILLEGAL_ACTIVITY_DESCRIPTOR = msg({
	message: 'Illegal activity',
	comment: 'Report category label for content describing or coordinating illegal activity. Keep tone plain.',
});
const SHARING_PERSONAL_INFORMATION_DESCRIPTOR = msg({
	message: 'Sharing personal information',
	comment: 'Report category label for doxxing or sharing private personal information without consent.',
});
const SELF_HARM_OR_SUICIDE_DESCRIPTOR = msg({
	message: 'Self-harm or suicide',
	comment:
		'Report category label for content that promotes or depicts self-harm or suicide. Keep tone calm and respectful; this is a safety surface.',
});
const CHILD_SAFETY_CONCERNS_DESCRIPTOR = msg({
	message: 'Child safety concerns',
	comment:
		'Report category label for content endangering minors. Keep tone calm and serious; this is a safety surface.',
});
const MALICIOUS_LINKS_DESCRIPTOR = msg({
	message: 'Malicious links',
	comment: 'Report category label for messages containing phishing or malware links.',
});
const IMPERSONATION_DESCRIPTOR = msg({
	message: 'Impersonation',
	comment: 'Report category label for a user impersonating another person or brand.',
});
const OTHER_DESCRIPTOR = msg({
	message: 'Other',
	comment: 'Report category label for a reason that does not match any predefined category.',
});
const SPAM_ACCOUNT_DESCRIPTOR = msg({
	message: 'Spam account',
	comment: 'Report category label for a user profile used primarily to send spam.',
});
const UNDERAGE_USER_DESCRIPTOR = msg({
	message: 'Underage user',
	comment: 'Report category label for an account that appears to belong to someone under the minimum age.',
});
const INAPPROPRIATE_PROFILE_DESCRIPTOR = msg({
	message: 'Inappropriate profile',
	comment: 'Report category label for an account whose profile (name, avatar, bio) violates policy.',
});
const HARASSMENT_DESCRIPTOR = msg({
	message: 'Harassment',
	comment: 'Report category label, community variant. Keep tone plain.',
});
const EXTREMIST_COMMUNITY_DESCRIPTOR = msg({
	message: 'Extremist community',
	comment: 'Report category label for a community organized around extremist content or ideology.',
});
const RAID_COORDINATION_DESCRIPTOR = msg({
	message: 'Raid coordination',
	comment:
		'Report category label for a community coordinating raids (mass harassment of other communities or users). "Raid" is product jargon.',
});
const SPAM_OR_SCAM_COMMUNITY_DESCRIPTOR = msg({
	message: 'Spam or scam community',
	comment: 'Report category label for a community whose purpose is spam or scams.',
});
const MALWARE_DISTRIBUTION_DESCRIPTOR = msg({
	message: 'Malware distribution',
	comment: 'Report category label for a community distributing malware or malicious software.',
});
const SELECT_A_COUNTRY_DESCRIPTOR = msg({
	message: 'Select a country',
	comment: 'Placeholder option label for the country dropdown in the EU illegal-content report flow.',
});
const AUSTRIA_DESCRIPTOR = msg({
	message: 'Austria',
	comment: 'Country name. EU member state in the illegal-content report country dropdown.',
});
const BELGIUM_DESCRIPTOR = msg({
	message: 'Belgium',
	comment: 'Country name. EU member state in the illegal-content report country dropdown.',
});
const BULGARIA_DESCRIPTOR = msg({
	message: 'Bulgaria',
	comment: 'Country name. EU member state in the illegal-content report country dropdown.',
});
const CROATIA_DESCRIPTOR = msg({
	message: 'Croatia',
	comment: 'Country name. EU member state in the illegal-content report country dropdown.',
});
const CYPRUS_DESCRIPTOR = msg({
	message: 'Cyprus',
	comment: 'Country name. EU member state in the illegal-content report country dropdown.',
});
const CZECH_REPUBLIC_DESCRIPTOR = msg({
	message: 'Czech Republic',
	comment: 'Country name. EU member state in the illegal-content report country dropdown.',
});
const DENMARK_DESCRIPTOR = msg({
	message: 'Denmark',
	comment: 'Country name. EU member state in the illegal-content report country dropdown.',
});
const ESTONIA_DESCRIPTOR = msg({
	message: 'Estonia',
	comment: 'Country name. EU member state in the illegal-content report country dropdown.',
});
const FINLAND_DESCRIPTOR = msg({
	message: 'Finland',
	comment: 'Country name. EU member state in the illegal-content report country dropdown.',
});
const FRANCE_DESCRIPTOR = msg({
	message: 'France',
	comment: 'Country name. EU member state in the illegal-content report country dropdown.',
});
const GERMANY_DESCRIPTOR = msg({
	message: 'Germany',
	comment: 'Country name. EU member state in the illegal-content report country dropdown.',
});
const GREECE_DESCRIPTOR = msg({
	message: 'Greece',
	comment: 'Country name. EU member state in the illegal-content report country dropdown.',
});
const HUNGARY_DESCRIPTOR = msg({
	message: 'Hungary',
	comment: 'Country name. EU member state in the illegal-content report country dropdown.',
});
const IRELAND_DESCRIPTOR = msg({
	message: 'Ireland',
	comment: 'Country name. EU member state in the illegal-content report country dropdown.',
});
const ITALY_DESCRIPTOR = msg({
	message: 'Italy',
	comment: 'Country name. EU member state in the illegal-content report country dropdown.',
});
const LATVIA_DESCRIPTOR = msg({
	message: 'Latvia',
	comment: 'Country name. EU member state in the illegal-content report country dropdown.',
});
const LITHUANIA_DESCRIPTOR = msg({
	message: 'Lithuania',
	comment: 'Country name. EU member state in the illegal-content report country dropdown.',
});
const LUXEMBOURG_DESCRIPTOR = msg({
	message: 'Luxembourg',
	comment: 'Country name. EU member state in the illegal-content report country dropdown.',
});
const MALTA_DESCRIPTOR = msg({
	message: 'Malta',
	comment: 'Country name. EU member state in the illegal-content report country dropdown.',
});
const NETHERLANDS_DESCRIPTOR = msg({
	message: 'Netherlands',
	comment: 'Country name. EU member state in the illegal-content report country dropdown.',
});
const POLAND_DESCRIPTOR = msg({
	message: 'Poland',
	comment: 'Country name. EU member state in the illegal-content report country dropdown.',
});
const PORTUGAL_DESCRIPTOR = msg({
	message: 'Portugal',
	comment: 'Country name. EU member state in the illegal-content report country dropdown.',
});
const ROMANIA_DESCRIPTOR = msg({
	message: 'Romania',
	comment: 'Country name. EU member state in the illegal-content report country dropdown.',
});
const SLOVAKIA_DESCRIPTOR = msg({
	message: 'Slovakia',
	comment: 'Country name. EU member state in the illegal-content report country dropdown.',
});
const SLOVENIA_DESCRIPTOR = msg({
	message: 'Slovenia',
	comment: 'Country name. EU member state in the illegal-content report country dropdown.',
});
const SPAIN_DESCRIPTOR = msg({
	message: 'Spain',
	comment: 'Country name. EU member state in the illegal-content report country dropdown.',
});
const SWEDEN_DESCRIPTOR = msg({
	message: 'Sweden',
	comment: 'Country name. EU member state in the illegal-content report country dropdown.',
});

export interface SelectDescriptor {
	value: string;
	label: MessageDescriptor;
}

export interface RadioDescriptor<T> {
	value: T;
	name: MessageDescriptor;
}

export const REPORT_TYPE_OPTION_DESCRIPTORS: ReadonlyArray<RadioDescriptor<ReportType>> = [
	{value: 'message', name: REPORT_A_MESSAGE_DESCRIPTOR},
	{value: 'user', name: REPORT_A_USER_PROFILE_DESCRIPTOR},
	{value: 'guild', name: REPORT_A_COMMUNITY_DESCRIPTOR},
];
export const MESSAGE_CATEGORY_OPTIONS: ReadonlyArray<SelectDescriptor> = [
	{value: '', label: SELECT_A_CATEGORY_DESCRIPTOR},
	{value: 'harassment', label: HARASSMENT_OR_BULLYING_DESCRIPTOR},
	{value: 'hate_speech', label: HATE_SPEECH_DESCRIPTOR},
	{value: 'violent_content', label: VIOLENT_OR_GRAPHIC_CONTENT_DESCRIPTOR},
	{value: 'spam', label: SPAM_OR_SCAM_DESCRIPTOR},
	{value: 'nsfw_violation', label: MATURE_CONTENT_POLICY_VIOLATION_DESCRIPTOR},
	{value: 'illegal_activity', label: ILLEGAL_ACTIVITY_DESCRIPTOR},
	{value: 'doxxing', label: SHARING_PERSONAL_INFORMATION_DESCRIPTOR},
	{value: 'self_harm', label: SELF_HARM_OR_SUICIDE_DESCRIPTOR},
	{value: 'child_safety', label: CHILD_SAFETY_CONCERNS_DESCRIPTOR},
	{value: 'malicious_links', label: MALICIOUS_LINKS_DESCRIPTOR},
	{value: 'impersonation', label: IMPERSONATION_DESCRIPTOR},
	{value: 'other', label: OTHER_DESCRIPTOR},
];
export const USER_CATEGORY_OPTIONS: ReadonlyArray<SelectDescriptor> = [
	{value: '', label: SELECT_A_CATEGORY_DESCRIPTOR},
	{value: 'harassment', label: HARASSMENT_OR_BULLYING_DESCRIPTOR},
	{value: 'hate_speech', label: HATE_SPEECH_DESCRIPTOR},
	{value: 'spam_account', label: SPAM_ACCOUNT_DESCRIPTOR},
	{value: 'impersonation', label: IMPERSONATION_DESCRIPTOR},
	{value: 'underage_user', label: UNDERAGE_USER_DESCRIPTOR},
	{value: 'inappropriate_profile', label: INAPPROPRIATE_PROFILE_DESCRIPTOR},
	{value: 'other', label: OTHER_DESCRIPTOR},
];
export const GUILD_CATEGORY_OPTIONS: ReadonlyArray<SelectDescriptor> = [
	{value: '', label: SELECT_A_CATEGORY_DESCRIPTOR},
	{value: 'harassment', label: HARASSMENT_DESCRIPTOR},
	{value: 'hate_speech', label: HATE_SPEECH_DESCRIPTOR},
	{value: 'extremist_community', label: EXTREMIST_COMMUNITY_DESCRIPTOR},
	{value: 'illegal_activity', label: ILLEGAL_ACTIVITY_DESCRIPTOR},
	{value: 'child_safety', label: CHILD_SAFETY_CONCERNS_DESCRIPTOR},
	{value: 'raid_coordination', label: RAID_COORDINATION_DESCRIPTOR},
	{value: 'spam', label: SPAM_OR_SCAM_COMMUNITY_DESCRIPTOR},
	{value: 'malware_distribution', label: MALWARE_DISTRIBUTION_DESCRIPTOR},
	{value: 'other', label: OTHER_DESCRIPTOR},
];
export const COUNTRY_OPTIONS: ReadonlyArray<SelectDescriptor> = [
	{value: '', label: SELECT_A_COUNTRY_DESCRIPTOR},
	{value: 'AT', label: AUSTRIA_DESCRIPTOR},
	{value: 'BE', label: BELGIUM_DESCRIPTOR},
	{value: 'BG', label: BULGARIA_DESCRIPTOR},
	{value: 'HR', label: CROATIA_DESCRIPTOR},
	{value: 'CY', label: CYPRUS_DESCRIPTOR},
	{value: 'CZ', label: CZECH_REPUBLIC_DESCRIPTOR},
	{value: 'DK', label: DENMARK_DESCRIPTOR},
	{value: 'EE', label: ESTONIA_DESCRIPTOR},
	{value: 'FI', label: FINLAND_DESCRIPTOR},
	{value: 'FR', label: FRANCE_DESCRIPTOR},
	{value: 'DE', label: GERMANY_DESCRIPTOR},
	{value: 'GR', label: GREECE_DESCRIPTOR},
	{value: 'HU', label: HUNGARY_DESCRIPTOR},
	{value: 'IE', label: IRELAND_DESCRIPTOR},
	{value: 'IT', label: ITALY_DESCRIPTOR},
	{value: 'LV', label: LATVIA_DESCRIPTOR},
	{value: 'LT', label: LITHUANIA_DESCRIPTOR},
	{value: 'LU', label: LUXEMBOURG_DESCRIPTOR},
	{value: 'MT', label: MALTA_DESCRIPTOR},
	{value: 'NL', label: NETHERLANDS_DESCRIPTOR},
	{value: 'PL', label: POLAND_DESCRIPTOR},
	{value: 'PT', label: PORTUGAL_DESCRIPTOR},
	{value: 'RO', label: ROMANIA_DESCRIPTOR},
	{value: 'SK', label: SLOVAKIA_DESCRIPTOR},
	{value: 'SI', label: SLOVENIA_DESCRIPTOR},
	{value: 'ES', label: SPAIN_DESCRIPTOR},
	{value: 'SE', label: SWEDEN_DESCRIPTOR},
];

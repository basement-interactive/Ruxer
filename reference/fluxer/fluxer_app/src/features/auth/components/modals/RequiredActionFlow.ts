// SPDX-License-Identifier: AGPL-3.0-or-later

import type {RequiredAction} from '@fluxer/schema/src/domains/user/UserResponseSchemas';

export type VerificationMode = 'email' | 'phone' | 'email_or_phone' | 'email_and_phone';
export type VerificationChannel = 'email' | 'phone';

export interface ChannelVerificationPlan {
	readonly channel: VerificationChannel;
	readonly actions: ReadonlyArray<RequiredAction>;
	readonly reverify: boolean;
	readonly clearsAll: boolean;
	readonly remainingActionsAfterCompletion: ReadonlyArray<RequiredAction>;
	readonly requiresInboundPhone: boolean;
}

export interface RequiredActionFlow {
	readonly actions: ReadonlyArray<RequiredAction>;
	readonly key: string;
	readonly mode: VerificationMode;
	readonly defaultTab: VerificationChannel;
	readonly email: ChannelVerificationPlan | null;
	readonly phone: ChannelVerificationPlan | null;
	readonly reverify: boolean;
	readonly requiresInboundPhone: boolean;
}

const EMAIL_ACTIONS = new Set<RequiredAction>([
	'REQUIRE_VERIFIED_EMAIL',
	'REQUIRE_REVERIFIED_EMAIL',
	'REQUIRE_VERIFIED_EMAIL_OR_VERIFIED_PHONE',
	'REQUIRE_REVERIFIED_EMAIL_OR_VERIFIED_PHONE',
	'REQUIRE_VERIFIED_EMAIL_OR_REVERIFIED_PHONE',
	'REQUIRE_REVERIFIED_EMAIL_OR_REVERIFIED_PHONE',
]);
const PHONE_ACTIONS = new Set<RequiredAction>([
	'REQUIRE_VERIFIED_PHONE',
	'REQUIRE_REVERIFIED_PHONE',
	'REQUIRE_VERIFIED_EMAIL_OR_VERIFIED_PHONE',
	'REQUIRE_REVERIFIED_EMAIL_OR_VERIFIED_PHONE',
	'REQUIRE_VERIFIED_EMAIL_OR_REVERIFIED_PHONE',
	'REQUIRE_REVERIFIED_EMAIL_OR_REVERIFIED_PHONE',
	'REQUIRE_INBOUND_PHONE_VERIFICATION',
]);
const EMAIL_REVERIFY_ACTIONS = new Set<RequiredAction>([
	'REQUIRE_REVERIFIED_EMAIL',
	'REQUIRE_REVERIFIED_EMAIL_OR_VERIFIED_PHONE',
	'REQUIRE_REVERIFIED_EMAIL_OR_REVERIFIED_PHONE',
]);
const PHONE_REVERIFY_ACTIONS = new Set<RequiredAction>([
	'REQUIRE_REVERIFIED_PHONE',
	'REQUIRE_VERIFIED_EMAIL_OR_REVERIFIED_PHONE',
	'REQUIRE_REVERIFIED_EMAIL_OR_REVERIFIED_PHONE',
]);
const EMAIL_COMPLETION_CLEARED_ACTIONS = new Set<RequiredAction>([
	'REQUIRE_VERIFIED_EMAIL',
	'REQUIRE_REVERIFIED_EMAIL',
	'REQUIRE_VERIFIED_EMAIL_OR_VERIFIED_PHONE',
	'REQUIRE_REVERIFIED_EMAIL_OR_VERIFIED_PHONE',
	'REQUIRE_VERIFIED_EMAIL_OR_REVERIFIED_PHONE',
	'REQUIRE_REVERIFIED_EMAIL_OR_REVERIFIED_PHONE',
]);
const PHONE_COMPLETION_CLEARED_ACTIONS = new Set<RequiredAction>([
	'REQUIRE_VERIFIED_PHONE',
	'REQUIRE_REVERIFIED_PHONE',
	'REQUIRE_VERIFIED_EMAIL_OR_VERIFIED_PHONE',
	'REQUIRE_REVERIFIED_EMAIL_OR_VERIFIED_PHONE',
	'REQUIRE_VERIFIED_EMAIL_OR_REVERIFIED_PHONE',
	'REQUIRE_REVERIFIED_EMAIL_OR_REVERIFIED_PHONE',
	'REQUIRE_INBOUND_PHONE_VERIFICATION',
]);

function sortActions(actions: ReadonlyArray<RequiredAction>): Array<RequiredAction> {
	return [...new Set(actions)].sort();
}

function clearChannelActions(
	actions: ReadonlyArray<RequiredAction>,
	channel: VerificationChannel,
): ReadonlyArray<RequiredAction> {
	const clearedActions = channel === 'email' ? EMAIL_COMPLETION_CLEARED_ACTIONS : PHONE_COMPLETION_CLEARED_ACTIONS;
	return actions.filter((action) => !clearedActions.has(action));
}

function buildChannelPlan(
	channel: VerificationChannel,
	actions: ReadonlyArray<RequiredAction>,
): ChannelVerificationPlan | null {
	const channelActionSet = channel === 'email' ? EMAIL_ACTIONS : PHONE_ACTIONS;
	const reverifyActionSet = channel === 'email' ? EMAIL_REVERIFY_ACTIONS : PHONE_REVERIFY_ACTIONS;
	const channelActions = actions.filter((action) => channelActionSet.has(action));
	if (channelActions.length === 0) {
		return null;
	}
	const remainingActionsAfterCompletion = clearChannelActions(actions, channel);
	return {
		channel,
		actions: channelActions,
		reverify: channelActions.some((action) => reverifyActionSet.has(action)),
		clearsAll: remainingActionsAfterCompletion.length === 0,
		remainingActionsAfterCompletion,
		requiresInboundPhone: channel === 'phone' && actions.includes('REQUIRE_INBOUND_PHONE_VERIFICATION'),
	};
}

function pickDefaultTab(
	email: ChannelVerificationPlan | null,
	phone: ChannelVerificationPlan | null,
): VerificationChannel {
	if (!email) {
		return 'phone';
	}
	if (!phone) {
		return 'email';
	}
	if (email.clearsAll !== phone.clearsAll) {
		return email.clearsAll ? 'email' : 'phone';
	}
	if (email.remainingActionsAfterCompletion.length !== phone.remainingActionsAfterCompletion.length) {
		return email.remainingActionsAfterCompletion.length < phone.remainingActionsAfterCompletion.length
			? 'email'
			: 'phone';
	}
	return 'email';
}

export function getRequiredActionsKey(
	requiredActions: ReadonlyArray<RequiredAction> | null | undefined,
): string | null {
	if (!requiredActions || requiredActions.length === 0) {
		return null;
	}
	return sortActions(requiredActions).join('|');
}

export function resolveRequiredActionFlow(
	requiredActions: ReadonlyArray<RequiredAction> | null | undefined,
): RequiredActionFlow | null {
	if (!requiredActions || requiredActions.length === 0) {
		return null;
	}
	const actions = sortActions(requiredActions);
	const email = buildChannelPlan('email', actions);
	const phone = buildChannelPlan('phone', actions);
	let mode: VerificationMode = 'email';
	if (email && phone) {
		mode = email.clearsAll || phone.clearsAll ? 'email_or_phone' : 'email_and_phone';
	} else if (phone) {
		mode = 'phone';
	}
	return {
		actions,
		key: getRequiredActionsKey(actions)!,
		mode,
		defaultTab: pickDefaultTab(email, phone),
		email,
		phone,
		reverify: !!email?.reverify || !!phone?.reverify,
		requiresInboundPhone: phone?.requiresInboundPhone ?? false,
	};
}

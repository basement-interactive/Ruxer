// SPDX-License-Identifier: AGPL-3.0-or-later

import type {Guild} from '@app/features/guild/models/Guild';
import Guilds from '@app/features/guild/state/Guilds';
import GuildMembers from '@app/features/member/state/GuildMembers';
import Users from '@app/features/user/state/Users';
import {
	GuildFeatures,
	GuildOperations,
	GuildVerificationLevel,
	getEffectiveGuildVerificationLevel,
} from '@fluxer/constants/src/GuildConstants';
import type {ValueOf} from '@fluxer/constants/src/ValueOf';
import {makeAutoObservable} from 'mobx';

const FIVE_MINUTES_MS = 5 * 60 * 1000;
const TEN_MINUTES_MS = 10 * 60 * 1000;
export const VerificationFailureReason = {
	UNCLAIMED_ACCOUNT: 'UNCLAIMED_ACCOUNT',
	UNVERIFIED_EMAIL: 'UNVERIFIED_EMAIL',
	ACCOUNT_TOO_NEW: 'ACCOUNT_TOO_NEW',
	NOT_MEMBER_LONG_ENOUGH: 'NOT_MEMBER_LONG_ENOUGH',
	NO_PHONE_NUMBER: 'NO_PHONE_NUMBER',
	SEND_MESSAGE_DISABLED: 'SEND_MESSAGE_DISABLED',
	TIMED_OUT: 'TIMED_OUT',
} as const;

export type VerificationFailureReason = ValueOf<typeof VerificationFailureReason>;

interface VerificationStatus {
	canAccess: boolean;
	reason?: VerificationFailureReason;
	timeRemaining?: number;
}

class GuildVerification {
	verificationStatus: Record<string, VerificationStatus> = {};
	private timers: Record<string, NodeJS.Timeout> = {};

	constructor() {
		makeAutoObservable(this, {}, {autoBind: true});
	}

	handleConnectionOpen(): void {
		this.recomputeAll();
	}

	handleGuildCreate(guild: {id: string}): void {
		this.recomputeGuild(guild.id);
	}

	handleGuildUpdate(guild: {id: string}): void {
		this.recomputeGuild(guild.id);
	}

	handleGuildDelete(guildId: string): void {
		const newVerificationStatus = {...this.verificationStatus};
		delete newVerificationStatus[guildId];
		if (this.timers[guildId]) {
			clearTimeout(this.timers[guildId]);
			delete this.timers[guildId];
		}
		this.verificationStatus = Object.freeze(newVerificationStatus);
	}

	handleGuildMemberUpdate(guildId: string): void {
		this.recomputeGuild(guildId);
	}

	handleUserUpdate(): void {
		this.recomputeAll();
	}

	private recomputeAll(): void {
		const guilds = Guilds.getGuilds();
		const newVerificationStatus: Record<string, VerificationStatus> = {};
		for (const timerId of Object.values(this.timers)) {
			clearTimeout(timerId);
		}
		const newTimers: Record<string, NodeJS.Timeout> = {};
		for (const guild of guilds) {
			const status = this.computeVerificationStatus(guild);
			newVerificationStatus[guild.id] = status;
			if (!status.canAccess && status.timeRemaining && status.timeRemaining > 0) {
				newTimers[guild.id] = setTimeout(() => {
					this.recomputeGuild(guild.id);
				}, status.timeRemaining);
			}
		}
		this.verificationStatus = Object.freeze(newVerificationStatus);
		this.timers = newTimers;
	}

	private recomputeGuild(guildId: string): void {
		const guild = Guilds.getGuild(guildId);
		if (!guild) {
			return;
		}
		const status = this.computeVerificationStatus(guild);
		const newVerificationStatus = {
			...this.verificationStatus,
			[guildId]: status,
		};
		if (this.timers[guildId]) {
			clearTimeout(this.timers[guildId]);
		}
		const newTimers = {...this.timers};
		delete newTimers[guildId];
		if (!status.canAccess && status.timeRemaining && status.timeRemaining > 0) {
			newTimers[guildId] = setTimeout(() => {
				this.recomputeGuild(guildId);
			}, status.timeRemaining);
		}
		this.verificationStatus = Object.freeze(newVerificationStatus);
		this.timers = newTimers;
	}

	private computeVerificationStatus(guild: Guild): VerificationStatus {
		const user = Users.getCurrentUser();
		if (!user) {
			return {canAccess: false, reason: VerificationFailureReason.UNCLAIMED_ACCOUNT};
		}
		const member = GuildMembers.getMember(guild.id, user.id);
		const now = Date.now();
		if (member?.communicationDisabledUntil) {
			const timeoutUntil = member.communicationDisabledUntil;
			const timeRemaining = timeoutUntil.getTime() - now;
			if (timeRemaining > 0) {
				return {
					canAccess: false,
					reason: VerificationFailureReason.TIMED_OUT,
					timeRemaining,
				};
			}
		}
		if ((guild.disabledOperations & GuildOperations.SEND_MESSAGE) !== 0) {
			return {canAccess: false, reason: VerificationFailureReason.SEND_MESSAGE_DISABLED};
		}
		if (user.id === guild.ownerId) {
			return {canAccess: true};
		}
		const verificationLevel = getEffectiveGuildVerificationLevel(
			guild.verificationLevel ?? GuildVerificationLevel.NONE,
			guild.features.has(GuildFeatures.DISCOVERABLE),
		);
		if (verificationLevel === GuildVerificationLevel.NONE) {
			return {canAccess: true};
		}
		if (member && member.roles.size > 0) {
			return {canAccess: true};
		}
		if (verificationLevel === GuildVerificationLevel.VERY_HIGH) {
			if (!user.hasVerifiedPhone) {
				return {canAccess: false, reason: VerificationFailureReason.NO_PHONE_NUMBER};
			}
			return {canAccess: true};
		}
		if (!user.isClaimed()) {
			return {canAccess: false, reason: VerificationFailureReason.UNCLAIMED_ACCOUNT};
		}
		if (verificationLevel >= GuildVerificationLevel.LOW) {
			if (!user.verified) {
				return {canAccess: false, reason: VerificationFailureReason.UNVERIFIED_EMAIL};
			}
		}
		if (verificationLevel >= GuildVerificationLevel.MEDIUM) {
			const accountAge = Date.now() - user.createdAt.getTime();
			if (accountAge < FIVE_MINUTES_MS) {
				const timeRemaining = FIVE_MINUTES_MS - accountAge;
				return {canAccess: false, reason: VerificationFailureReason.ACCOUNT_TOO_NEW, timeRemaining};
			}
		}
		if (verificationLevel >= GuildVerificationLevel.HIGH) {
			if (member?.joinedAt) {
				const membershipDuration = Date.now() - member.joinedAt.getTime();
				if (membershipDuration < TEN_MINUTES_MS) {
					const timeRemaining = TEN_MINUTES_MS - membershipDuration;
					return {canAccess: false, reason: VerificationFailureReason.NOT_MEMBER_LONG_ENOUGH, timeRemaining};
				}
			}
		}
		return {canAccess: true};
	}

	canAccessGuild(guildId: string): boolean {
		const status = this.verificationStatus[guildId];
		return status?.canAccess ?? true;
	}

	getVerificationStatus(guildId: string): VerificationStatus | null {
		return this.verificationStatus[guildId] ?? null;
	}

	getFailureReason(guildId: string): VerificationFailureReason | null {
		return this.verificationStatus[guildId]?.reason ?? null;
	}

	getTimeRemaining(guildId: string): number | null {
		return this.verificationStatus[guildId]?.timeRemaining ?? null;
	}
}

export default new GuildVerification();

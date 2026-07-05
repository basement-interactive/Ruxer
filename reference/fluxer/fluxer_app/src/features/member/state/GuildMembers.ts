// SPDX-License-Identifier: AGPL-3.0-or-later

import GatewayConnection from '@app/features/gateway/transport/GatewayConnection';
import type {GuildReadyData} from '@app/features/gateway/types/GatewayGuildTypes';
import {GuildMember} from '@app/features/member/models/GuildMember';
import SelectedGuild from '@app/features/navigation/state/SelectedGuild';
import {Logger} from '@app/features/platform/utils/AppLogger';
import Users from '@app/features/user/state/Users';
import type {GuildMemberData} from '@fluxer/schema/src/domains/guild/GuildMemberSchemas';
import {makeAutoObservable} from 'mobx';

type Members = Record<string, GuildMember>;

interface PendingMemberRequest {
	guildId: string;
	resolve: (members: Array<GuildMember>) => void;
	reject: (error: Error) => void;
	members: Array<GuildMember>;
	receivedChunks: number;
	expectedChunks: number;
	requestedUserIds?: Set<string>;
}

const MEMBER_REQUEST_TIMEOUT = 30000;
const MEMBER_NONCE_LENGTH = 32;
const MEMBER_NONCE_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const MAX_USER_IDS_PER_REQUEST = 100;
const logger = new Logger('GuildMembers');

function generateMemberNonce(): string {
	let nonce = '';
	const charsLength = MEMBER_NONCE_CHARS.length;
	for (let i = 0; i < MEMBER_NONCE_LENGTH; i += 1) {
		nonce += MEMBER_NONCE_CHARS[Math.floor(Math.random() * charsLength)];
	}
	return nonce;
}

function addVoiceStateMembers(guild: GuildReadyData, members: Members): void {
	if (!guild.voice_states) {
		return;
	}
	const voiceStateMembers: Array<GuildMemberData> = [];
	for (const voiceState of guild.voice_states) {
		if (!voiceState.member) {
			continue;
		}
		voiceStateMembers.push(voiceState.member);
	}
	cacheGuildMemberUsers(voiceStateMembers);
	for (const member of voiceStateMembers) {
		members[member.user.id] = new GuildMember(guild.id, member, {cacheUser: false});
	}
}

function cacheGuildMemberUsers(members: ReadonlyArray<GuildMemberData>): void {
	if (members.length === 0) {
		return;
	}
	Users.cacheUsers(members.map((member) => member.user));
}

function getMissingVoiceStateMemberUserIds(guild: GuildReadyData, members: Members): Array<string> {
	if (!guild.voice_states || guild.voice_states.length === 0) {
		return [];
	}
	const missingUserIds = new Set<string>();
	for (const voiceState of guild.voice_states) {
		if (voiceState.member) {
			continue;
		}
		if (members[voiceState.user_id]) {
			continue;
		}
		missingUserIds.add(voiceState.user_id);
	}
	return Array.from(missingUserIds);
}

class GuildMembers {
	members: Record<string, Members> = {};
	nonMembers: Record<string, Set<string>> = {};
	pendingRequests: Map<string, PendingMemberRequest> = new Map();
	loadedGuilds: Set<string> = new Set();
	private pendingMessageMemberHydration: Map<string, Set<string>> = new Map();

	constructor() {
		makeAutoObservable<this, 'pendingMessageMemberHydration'>(
			this,
			{
				pendingMessageMemberHydration: false,
			},
			{autoBind: true},
		);
	}

	getMember(guildId: string, userId?: string | null): GuildMember | null {
		if (!userId) {
			return null;
		}
		return this.members[guildId]?.[userId] ?? null;
	}

	isUserTimedOut(guildId: string | null, userId?: string | null): boolean {
		return this.getCommunicationDisabledUntil(guildId, userId) !== null;
	}

	getCommunicationDisabledUntil(guildId: string | null, userId?: string | null): Date | null {
		if (!guildId || !userId) {
			return null;
		}
		const until = this.members[guildId]?.[userId]?.communicationDisabledUntil ?? null;
		if (!until || until.getTime() <= Date.now()) {
			return null;
		}
		return until;
	}

	getMembers(guildId: string): Array<GuildMember> {
		return Object.values(this.members[guildId] ?? {});
	}

	getMemberCount(guildId: string): number {
		return Object.keys(this.members[guildId] ?? {}).length;
	}

	handleConnectionOpen(guilds: Array<GuildReadyData>): void {
		this.members = {};
		this.nonMembers = {};
		this.pendingMessageMemberHydration.clear();
		this.loadedGuilds.clear();
		for (const guild of guilds) {
			this.handleGuildCreate(guild);
		}
	}

	handleGuildCreate(guild: GuildReadyData, options?: {synced?: boolean}): void {
		if (guild.unavailable) {
			return;
		}
		const members: Members = {};
		cacheGuildMemberUsers(guild.members);
		for (const member of guild.members) {
			members[member.user.id] = new GuildMember(guild.id, member, {cacheUser: false});
		}
		addVoiceStateMembers(guild, members);
		const missingVoiceStateMemberUserIds = getMissingVoiceStateMemberUserIds(guild, members);
		this.members[guild.id] = members;
		if (missingVoiceStateMemberUserIds.length > 0 && GatewayConnection.socket) {
			void this.ensureMembersLoaded(guild.id, missingVoiceStateMemberUserIds).catch((error: unknown) => {
				logger.warn('Failed to fetch missing voice members after guild create', {
					guildId: guild.id,
					userIds: missingVoiceStateMemberUserIds,
					error,
				});
			});
		}
		if (options?.synced || GatewayConnection.hasCompletedGuildSync(guild.id)) {
			this.loadedGuilds.add(guild.id);
			this.flushPendingMessageMemberHydration(guild.id);
		}
	}

	handleGuildDelete(guildId: string): void {
		delete this.members[guildId];
		delete this.nonMembers[guildId];
		this.pendingMessageMemberHydration.delete(guildId);
		this.loadedGuilds.delete(guildId);
	}

	handleMemberAdd(guildId: string, member: GuildMemberData): void {
		if (!this.members[guildId]) {
			this.members[guildId] = {};
		}
		this.members[guildId][member.user.id] = new GuildMember(guildId, member);
		this.nonMembers[guildId]?.delete(member.user.id);
	}

	hydrateIfMissing(guildId: string, member: GuildMemberData): void {
		if (this.members[guildId]?.[member.user.id]) {
			return;
		}
		if (!this.members[guildId]) {
			this.members[guildId] = {};
		}
		this.members[guildId][member.user.id] = new GuildMember(guildId, member);
		this.nonMembers[guildId]?.delete(member.user.id);
	}

	handleMemberRemove(guildId: string, userId: string): void {
		const existingMembers = this.members[guildId];
		if (!existingMembers) {
			return;
		}
		delete existingMembers[userId];
		if (Object.keys(existingMembers).length === 0) {
			delete this.members[guildId];
		}
	}

	handleGuildRoleDelete(guildId: string, roleId: string): void {
		const existingMembers = this.members[guildId];
		if (!existingMembers) {
			return;
		}
		for (const memberId of Object.keys(existingMembers)) {
			const member = existingMembers[memberId];
			if (member.roles.has(roleId)) {
				const newRoles = new Set(member.roles);
				newRoles.delete(roleId);
				existingMembers[memberId] = new GuildMember(guildId, {
					...member.toJSON(),
					roles: Array.from(newRoles),
				});
			}
		}
	}

	handleMembersChunk(params: {
		guildId: string;
		members: Array<GuildMemberData>;
		chunkIndex: number;
		chunkCount: number;
		nonce?: string;
	}): void {
		const {guildId, members, chunkCount, nonce} = params;
		const newMembers: Array<GuildMember> = [];
		if (!this.members[guildId]) {
			this.members[guildId] = {};
		}
		const guildMembers = this.members[guildId];
		const negativeCache = this.nonMembers[guildId];
		for (const member of members) {
			const record = new GuildMember(guildId, member);
			newMembers.push(record);
			guildMembers[member.user.id] = record;
			negativeCache?.delete(member.user.id);
		}
		if (nonce) {
			const pending = this.pendingRequests.get(nonce);
			if (pending) {
				pending.members.push(...newMembers);
				pending.receivedChunks++;
				if (pending.receivedChunks >= chunkCount) {
					this.markNotFoundAsNonMembers(pending);
					pending.resolve(pending.members);
					this.pendingRequests.delete(nonce);
				}
			}
		}
	}

	private markNotFoundAsNonMembers(pending: PendingMemberRequest): void {
		const requested = pending.requestedUserIds;
		if (!requested || requested.size === 0) {
			return;
		}
		const returnedIds = new Set(pending.members.map((record) => record.user.id));
		const notFound: Array<string> = [];
		for (const id of requested) {
			if (!returnedIds.has(id)) {
				notFound.push(id);
			}
		}
		if (notFound.length === 0) {
			return;
		}
		if (!this.nonMembers[pending.guildId]) {
			this.nonMembers[pending.guildId] = new Set();
		}
		const cache = this.nonMembers[pending.guildId];
		for (const id of notFound) {
			cache.add(id);
		}
	}

	async fetchMembers(
		guildId: string,
		options?: {
			query?: string;
			limit?: number;
			userIds?: Array<string>;
			presences?: boolean;
		},
	): Promise<Array<GuildMember>> {
		const userIds = options?.userIds;
		if (userIds && userIds.length > MAX_USER_IDS_PER_REQUEST) {
			const all: Array<GuildMember> = [];
			for (let i = 0; i < userIds.length; i += MAX_USER_IDS_PER_REQUEST) {
				const slice = userIds.slice(i, i + MAX_USER_IDS_PER_REQUEST);
				const batch = await this.fetchMembers(guildId, {...options, userIds: slice});
				all.push(...batch);
			}
			return all;
		}
		const nonce = generateMemberNonce();
		return new Promise((resolve, reject) => {
			this.pendingRequests.set(nonce, {
				guildId,
				resolve,
				reject,
				members: [],
				receivedChunks: 0,
				expectedChunks: 1,
				requestedUserIds: userIds && userIds.length > 0 ? new Set(userIds) : undefined,
			});
			const socket = GatewayConnection.socket;
			const requestOptions: {
				guildId: string;
				nonce: string;
				query?: string;
				limit?: number;
				userIds?: Array<string>;
				presences?: boolean;
			} = {
				guildId,
				nonce,
				presences: options?.presences ?? true,
			};
			if (options?.query) {
				requestOptions.query = options.query;
			}
			if (options?.limit !== undefined) {
				requestOptions.limit = options.limit;
			}
			if (userIds && userIds.length > 0) {
				requestOptions.userIds = userIds;
			}
			socket?.requestGuildMembers(requestOptions);
			setTimeout(() => {
				if (this.pendingRequests.has(nonce)) {
					this.pendingRequests.delete(nonce);
					reject(new Error('Request timed out'));
				}
			}, MEMBER_REQUEST_TIMEOUT);
		});
	}

	requestMembersInBackground(options: {
		guildIds: Array<string>;
		query?: string;
		limit?: number;
		userIds?: Array<string>;
		presences?: boolean;
	}): void {
		const socket = GatewayConnection.socket;
		if (!socket) {
			return;
		}
		const guildIds = [...new Set(options.guildIds.filter((guildId) => guildId.length > 0))];
		if (guildIds.length === 0) {
			return;
		}
		socket.requestGuildMembers({
			guildIds,
			...(options.query !== undefined && {query: options.query}),
			...(options.limit !== undefined && {limit: options.limit}),
			...(options.userIds !== undefined && {userIds: options.userIds}),
			...(options.presences !== undefined && {presences: options.presences}),
		});
	}

	async ensureMembersLoaded(guildId: string, userIds: Array<string>): Promise<void> {
		const missingIds = this.getMissingMemberIds(guildId, userIds);
		if (missingIds.length === 0) {
			return;
		}
		await this.fetchMembers(guildId, {userIds: missingIds});
	}

	async ensureMembersLoadedForMessages(guildId: string, userIds: Array<string>): Promise<void> {
		const missingIds = this.getMissingMemberIds(guildId, userIds);
		if (missingIds.length === 0) {
			return;
		}
		if (GatewayConnection.hasCompletedGuildSync(guildId)) {
			await this.ensureMembersLoaded(guildId, missingIds);
			return;
		}
		this.queuePendingMessageMemberHydration(guildId, missingIds);
		if (SelectedGuild.selectedGuildId === guildId) {
			GatewayConnection.syncGuildIfNeeded(guildId, 'message-member-hydration');
		}
	}

	private getMissingMemberIds(guildId: string, userIds: Array<string>): Array<string> {
		const known = this.members[guildId];
		const negativeCache = this.nonMembers[guildId];
		return [...new Set(userIds)].filter((id) => !known?.[id] && !negativeCache?.has(id));
	}

	private queuePendingMessageMemberHydration(guildId: string, userIds: Array<string>): void {
		let pending = this.pendingMessageMemberHydration.get(guildId);
		if (!pending) {
			pending = new Set();
			this.pendingMessageMemberHydration.set(guildId, pending);
		}
		for (const userId of userIds) {
			pending.add(userId);
		}
	}

	private flushPendingMessageMemberHydration(guildId: string): void {
		const pending = this.pendingMessageMemberHydration.get(guildId);
		if (!pending || pending.size === 0) {
			return;
		}
		this.pendingMessageMemberHydration.delete(guildId);
		const missingIds = this.getMissingMemberIds(guildId, Array.from(pending));
		if (missingIds.length === 0) {
			return;
		}
		this.requestMembersInBackground({
			guildIds: [guildId],
			userIds: missingIds,
			presences: true,
		});
	}

	isGuildFullyLoaded(guildId: string): boolean {
		return this.loadedGuilds.has(guildId);
	}
}

export default new GuildMembers();

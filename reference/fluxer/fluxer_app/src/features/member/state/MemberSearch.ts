// SPDX-License-Identifier: AGPL-3.0-or-later

import Guilds from '@app/features/guild/state/Guilds';
import type {GuildMember} from '@app/features/member/models/GuildMember';
import GuildMembers from '@app/features/member/state/GuildMembers';
import {Logger} from '@app/features/platform/utils/AppLogger';
import Relationships from '@app/features/relationship/state/Relationships';
import Users from '@app/features/user/state/Users';
import {RelationshipTypes} from '@fluxer/constants/src/UserConstants';
import {makeAutoObservable} from 'mobx';

export enum MemberSearchActionTypes {
	UPDATE_USERS = 'UPDATE_USERS',
	USER_RESULTS = 'USER_RESULTS',
	QUERY_SET = 'QUERY_SET',
	QUERY_CLEAR = 'QUERY_CLEAR',
}

export enum MemberSearchWorkerMessageTypes {
	UPDATE_USERS = 'UPDATE_USERS',
	USER_RESULTS = 'USER_RESULTS',
	QUERY_SET = 'QUERY_SET',
	QUERY_CLEAR = 'QUERY_CLEAR',
}

export interface MemberSearchFilters {
	friends?: boolean;
	guild?: string;
}

export interface TransformedMember {
	id: string;
	username: string;
	isBot?: boolean;
	isFriend?: boolean;
	guildIds?: Array<string>;
	_delete?: boolean;
	_removeGuild?: string;
	[key: string]: string | boolean | undefined | Array<string>;
}

export type QueryBlacklist = Set<string>;
export type QueryWhitelist = Set<string>;
export type QueryBoosters = Record<string, number>;

interface QueryData {
	query: string;
	filters?: MemberSearchFilters;
	blacklist: Array<string>;
	whitelist: Array<string>;
	boosters: QueryBoosters;
	limit: number;
	generation: number;
}

interface WorkerMessage {
	type: MemberSearchWorkerMessageTypes;
	payload?: unknown;
	uuid?: string;
}

interface MemberResultsMessage extends WorkerMessage {
	type: MemberSearchWorkerMessageTypes.USER_RESULTS;
	uuid: string;
	generation: number;
	payload: Array<TransformedMember>;
}

interface UpdateMembersMessage extends WorkerMessage {
	type: MemberSearchWorkerMessageTypes.UPDATE_USERS;
	payload: {
		users: Array<TransformedMember>;
	};
}

interface QuerySetMessage extends WorkerMessage {
	type: MemberSearchWorkerMessageTypes.QUERY_SET;
	uuid: string;
	payload: QueryData;
}

interface QueryClearMessage extends WorkerMessage {
	type: MemberSearchWorkerMessageTypes.QUERY_CLEAR;
	uuid: string;
}

const DEFAULT_LIMIT = 10;
const BACKGROUND_FETCH_DEDUP_WINDOW_MS = 750;

let worker: Worker | null = null;

function updateMembers(members: Array<TransformedMember>): void {
	if (!worker) {
		return;
	}
	const filtered = members.filter((member) => member != null);
	if (filtered.length === 0) {
		return;
	}
	worker.postMessage({
		type: MemberSearchWorkerMessageTypes.UPDATE_USERS,
		payload: {users: filtered},
	} as UpdateMembersMessage);
}

function isFriendRelationship(userId: string): boolean {
	const relationship = Relationships.getRelationship(userId);
	return relationship?.type === RelationshipTypes.FRIEND;
}

function applyFriendFlag(member: TransformedMember): void {
	member.isFriend = isFriendRelationship(member.id);
}

function getTransformedMember(memberRecord: GuildMember, guildId?: string): TransformedMember | null {
	const user = memberRecord.user;
	const member: TransformedMember = {
		id: user.id,
		username: `${user.username}#${user.discriminator}`,
		guildIds: [],
	};
	if (user.bot) {
		member.isBot = true;
	}
	if (guildId) {
		member[guildId] = true;
		member.guildIds = [guildId];
	}
	applyFriendFlag(member);
	return member;
}

function updateMembersList(members: Array<GuildMember>, guildId?: string): Array<TransformedMember> {
	const transformedMembers: Array<TransformedMember> = [];
	for (const memberRecord of members) {
		const member = getTransformedMember(memberRecord, guildId);
		if (member) {
			transformedMembers.push(member);
		}
	}
	return transformedMembers;
}

export class SearchContext {
	private readonly _uuid: string;
	private readonly _callback: (results: Array<TransformedMember>) => void;
	private readonly _limit: number;
	private _currentQuery: QueryData | false | null;
	private _nextQuery: QueryData | null;
	private _latestGeneration: number;
	private _nextGeneration: number;
	private readonly _handleMessages: (event: MessageEvent<WorkerMessage>) => void;

	constructor(callback: (results: Array<TransformedMember>) => void, limit: number = DEFAULT_LIMIT) {
		this._uuid = crypto.randomUUID();
		this._callback = callback;
		this._limit = limit;
		this._currentQuery = null;
		this._nextQuery = null;
		this._latestGeneration = 0;
		this._nextGeneration = 1;
		this._handleMessages = (event: MessageEvent<WorkerMessage>) => {
			const data = event.data;
			if (!data || data.type !== MemberSearchWorkerMessageTypes.USER_RESULTS) {
				return;
			}
			const resultsMessage = data as MemberResultsMessage;
			if (resultsMessage.uuid !== this._uuid) {
				return;
			}
			if (resultsMessage.generation < this._latestGeneration) {
				return;
			}
			if (this._currentQuery !== false) {
				this._callback(resultsMessage.payload);
			}
			if (this._currentQuery != null) {
				this._currentQuery = null;
			}
			this._setNextQuery();
		};
		if (worker) {
			worker.addEventListener('message', this._handleMessages);
		}
	}

	destroy(): void {
		if (worker) {
			worker.removeEventListener('message', this._handleMessages);
		}
		this.clearQuery();
	}

	clearQuery(): void {
		this._currentQuery = false;
		this._nextQuery = null;
		if (worker) {
			worker.postMessage({
				uuid: this._uuid,
				type: MemberSearchWorkerMessageTypes.QUERY_CLEAR,
			} as QueryClearMessage);
		}
	}

	setQuery(
		query: string,
		filters: MemberSearchFilters = {},
		blacklist: QueryBlacklist = new Set(),
		whitelist: QueryWhitelist = new Set(),
		boosters: QueryBoosters = {},
	): void {
		if (query == null) {
			return;
		}
		const generation = this._nextGeneration++;
		this._latestGeneration = generation;
		this._nextQuery = {
			query,
			filters,
			blacklist: Array.from(blacklist),
			whitelist: Array.from(whitelist),
			boosters,
			limit: this._limit,
			generation,
		};
		this._setNextQuery();
	}

	private _setNextQuery(): void {
		if (this._currentQuery || !this._nextQuery) {
			return;
		}
		this._currentQuery = this._nextQuery;
		this._nextQuery = null;
		if (worker) {
			worker.postMessage({
				uuid: this._uuid,
				type: MemberSearchWorkerMessageTypes.QUERY_SET,
				payload: this._currentQuery,
			} as QuerySetMessage);
		}
	}
}

class MemberSearch {
	private logger = new Logger('MemberSearch');
	private initialized: boolean = false;
	private readonly inFlightFetches = new Map<string, Promise<void>>();

	constructor() {
		makeAutoObservable(this);
	}

	initialize(): void {
		if (this.initialized || worker) {
			return;
		}
		this.initialized = true;
		try {
			worker = new Worker(
				new URL(/* webpackChunkName: "member-search.worker" */ '../workers/MemberSearchWorker.ts', import.meta.url),
				{
					type: 'module',
				},
			);
			this.sendInitialMembers();
		} catch (err) {
			this.logger.error('Failed to initialize worker:', err);
		}
	}

	private sendInitialMembers(): void {
		if (!worker) {
			return;
		}
		const allMembers: Array<TransformedMember> = [];
		const guilds = Guilds.getGuilds();
		for (const guild of guilds) {
			const members = GuildMembers.getMembers(guild.id);
			const transformedMembers = updateMembersList(members, guild.id);
			allMembers.push(...transformedMembers);
		}
		updateMembers(allMembers);
	}

	handleConnectionOpen(): void {
		if (worker) {
			this.terminate();
		}
		this.initialize();
	}

	handleLogout(): void {
		this.terminate();
		this.initialized = false;
	}

	handleGuildCreate(guildId: string): void {
		if (!worker) return;
		const members = GuildMembers.getMembers(guildId);
		const transformedMembers = updateMembersList(members, guildId);
		updateMembers(transformedMembers);
	}

	handleGuildDelete(guildId: string): void {
		if (!worker) return;
		const members = GuildMembers.getMembers(guildId);
		const transformedMembers = updateMembersList(members, guildId);
		updateMembers(
			transformedMembers.map((m) => ({
				id: m.id,
				username: m.username,
				isBot: m.isBot,
				_removeGuild: guildId,
			})),
		);
	}

	handleMemberAdd(guildId: string, memberId: string): void {
		if (!worker) return;
		const member = GuildMembers.getMember(guildId, memberId);
		if (!member) return;
		const transformedMember = getTransformedMember(member, guildId);
		if (transformedMember) {
			updateMembers([transformedMember]);
		}
	}

	handleMemberUpdate(guildId: string, memberId: string): void {
		if (!worker) return;
		const member = GuildMembers.getMember(guildId, memberId);
		if (!member) return;
		const transformedMember = getTransformedMember(member, guildId);
		if (transformedMember) {
			updateMembers([transformedMember]);
		}
	}

	handleMembersChunk(guildId: string, members: Array<GuildMember>): void {
		if (!worker) return;
		const transformedMembers = updateMembersList(members, guildId);
		updateMembers(transformedMembers);
	}

	handleUserUpdate(userId: string): void {
		if (!worker) return;
		const guilds = Guilds.getGuilds();
		const allMembers: Array<TransformedMember> = [];
		for (const guild of guilds) {
			const member = GuildMembers.getMember(guild.id, userId);
			if (member) {
				const transformedMember = getTransformedMember(member, guild.id);
				if (transformedMember) {
					allMembers.push(transformedMember);
				}
			}
		}
		if (allMembers.length > 0) {
			updateMembers(allMembers);
		}
	}

	handleFriendshipChange(userId: string, isFriend: boolean): void {
		if (!worker) return;
		const user = Users.getUser(userId);
		if (!user) return;
		const username = `${user.username}#${user.discriminator}`;
		updateMembers([{id: userId, username, isFriend}]);
	}

	getSearchContext(
		callback: (results: Array<TransformedMember>) => void,
		limit: number = DEFAULT_LIMIT,
	): SearchContext {
		if (!worker) {
			this.initialize();
		}
		return new SearchContext(callback, limit);
	}

	private terminate(): void {
		if (worker) {
			worker.terminate();
			worker = null;
		}
	}

	cleanup(): void {
		this.terminate();
		this.initialized = false;
		this.inFlightFetches.clear();
	}

	async fetchMembersInBackground(query: string, guildIds: Array<string>, priorityGuildId?: string): Promise<void> {
		const trimmed = query['trim']();
		if (!trimmed) {
			return;
		}
		if (!guildIds || guildIds.length === 0) {
			return;
		}
		const sortedGuildIds = priorityGuildId
			? [...guildIds].sort((a, b) => (a === priorityGuildId ? -1 : b === priorityGuildId ? 1 : 0))
			: guildIds;
		const eligibleGuildIds = sortedGuildIds.filter((guildId) => {
			if (!guildId) {
				return false;
			}
			const guild = Guilds.getGuild(guildId);
			if (!guild) {
				return false;
			}
			return !GuildMembers.isGuildFullyLoaded(guildId);
		});
		if (eligibleGuildIds.length === 0) {
			return;
		}
		const key = `${eligibleGuildIds.join(',')}:${trimmed.toLowerCase()}`;
		const existing = this.inFlightFetches.get(key);
		if (existing) {
			await existing;
			return;
		}
		const promise = new Promise<void>((resolve) => {
			GuildMembers.requestMembersInBackground({
				guildIds: eligibleGuildIds,
				query: trimmed,
				limit: 25,
				presences: true,
			});
			setTimeout(resolve, BACKGROUND_FETCH_DEDUP_WINDOW_MS);
		}).finally(() => {
			this.inFlightFetches.delete(key);
		});
		this.inFlightFetches.set(key, promise);
		await promise;
	}
}

export default new MemberSearch();

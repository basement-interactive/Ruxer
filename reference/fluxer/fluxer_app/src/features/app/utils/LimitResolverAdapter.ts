// SPDX-License-Identifier: AGPL-3.0-or-later

import InstanceConfig from '@app/features/app/state/InstanceConfig';
import RuntimeConfig from '@app/features/app/state/RuntimeConfig';
import type {LimitContextInput} from '@app/features/app/utils/LimitContext';
import {LimitContext} from '@app/features/app/utils/LimitContext';
import type {LimitKey} from '@fluxer/constants/src/LimitConfigMetadata';
import {resolveLimit, resolveLimits} from '@fluxer/limits/src/LimitResolver';
import type {LimitConfigSnapshot} from '@fluxer/limits/src/LimitTypes';

export interface LimitResolveOptions {
	key: LimitKey;
	fallback: number;
	context?: LimitContextInput;
	instanceDomain?: string;
}

class LimitResolverClass {
	resolve(options: LimitResolveOptions): number {
		const {key, fallback, context, instanceDomain} = options;
		const snapshot = this.getSnapshotForInstance(instanceDomain);
		const ctx = context ? LimitContext.build(context) : LimitContext.current();
		const resolved = resolveLimit(snapshot, ctx, key);
		if (!Number.isFinite(resolved) || resolved < 0) {
			return fallback;
		}
		return Math.floor(resolved);
	}

	private getSnapshotForInstance(instanceDomain?: string): LimitConfigSnapshot {
		if (instanceDomain) {
			const instanceLimits = InstanceConfig.getLimitsForInstance(instanceDomain);
			if (instanceLimits) {
				return instanceLimits;
			}
		}
		return RuntimeConfig.limits;
	}

	resolveMultiple(
		keys: Array<LimitKey>,
		fallback: number,
		context?: LimitContextInput,
		instanceDomain?: string,
	): Record<string, number> {
		const snapshot = this.getSnapshotForInstance(instanceDomain);
		const ctx = context ? LimitContext.build(context) : LimitContext.current();
		const {limits} = resolveLimits(snapshot, ctx);
		const result: Record<string, number> = {};
		for (const key of keys) {
			const resolved = limits[key];
			result[key] = Number.isFinite(resolved) && resolved >= 0 ? Math.floor(resolved) : fallback;
		}
		return result;
	}

	resolvePremium(key: LimitKey, fallback: number): number {
		return this.resolveStock(key, fallback);
	}

	resolveFree(key: LimitKey, fallback: number): number {
		return this.resolveRestricted(key, fallback);
	}

	resolveStock(key: LimitKey, fallback: number): number {
		return this.resolve({
			key,
			fallback,
			context: LimitContext.stock(),
		});
	}

	resolveRestricted(key: LimitKey, fallback: number): number {
		return this.resolve({
			key,
			fallback,
			context: LimitContext.restricted(),
		});
	}
}

export const LimitResolver = new LimitResolverClass();

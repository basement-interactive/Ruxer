// SPDX-License-Identifier: AGPL-3.0-or-later

import {LIMIT_KEYS, type LimitKey} from '@fluxer/constants/src/LimitConfigMetadata';
import type {ILimitConfigCodec, LimitConfigCodecOptions} from '@fluxer/limits/src/ILimitConfigCodec';
import {DEFAULT_FREE_LIMITS} from '@fluxer/limits/src/LimitDefaults';
import {computeDefaultsHash} from '@fluxer/limits/src/LimitHashing';
import type {LimitConfigSnapshot, LimitConfigWireFormat} from '@fluxer/limits/src/LimitTypes';

const WIRE_COMPATIBILITY_LIMIT_KEYS: ReadonlySet<LimitKey> = new Set<LimitKey>([
	'max_guild_emojis',
	'max_guild_emojis_animated_more',
	'max_guild_emojis_animated',
	'max_guild_emojis_static_more',
	'max_guild_emojis_static',
	'max_guild_stickers_more',
	'max_guild_stickers',
]);

export class LimitConfigCodec implements ILimitConfigCodec {
	computeOverrides(
		fullLimits: Partial<Record<LimitKey, number>>,
		defaults: Record<LimitKey, number>,
	): Partial<Record<LimitKey, number>> {
		const overrides: Partial<Record<LimitKey, number>> = {};
		for (const key of LIMIT_KEYS) {
			const value = fullLimits[key];
			if (value === undefined) {
				continue;
			}
			if (value !== defaults[key]) {
				overrides[key] = value;
			}
		}
		return overrides;
	}

	private addWireCompatibilityOverrides(
		overrides: Partial<Record<LimitKey, number>>,
		fullLimits: Partial<Record<LimitKey, number>>,
	): Partial<Record<LimitKey, number>> {
		for (const key of WIRE_COMPATIBILITY_LIMIT_KEYS) {
			const value = fullLimits[key];
			if (value !== undefined) {
				overrides[key] = value;
			}
		}
		return overrides;
	}

	toWireFormat(config: LimitConfigSnapshot, options?: LimitConfigCodecOptions): LimitConfigWireFormat {
		const defaults = options?.defaults ?? DEFAULT_FREE_LIMITS;
		const defaultsHash = options?.defaultsHash ?? computeDefaultsHash();
		const rules = config.rules.map((rule) => {
			const overrides = this.addWireCompatibilityOverrides(this.computeOverrides(rule.limits, defaults), rule.limits);
			return {
				id: rule.id,
				filters: rule.filters,
				overrides,
			};
		});
		return {
			version: 2,
			traitDefinitions: config.traitDefinitions,
			rules,
			defaultsHash,
		};
	}

	fromWireFormat(wireFormat: LimitConfigWireFormat, options?: LimitConfigCodecOptions): LimitConfigSnapshot {
		const defaults = options?.defaults ?? DEFAULT_FREE_LIMITS;
		const rules = wireFormat.rules.map((rule) => {
			const limits: Partial<Record<LimitKey, number>> = {
				...defaults,
				...rule.overrides,
			};
			return {
				id: rule.id,
				filters: rule.filters,
				limits,
			};
		});
		return {
			version: wireFormat.version,
			traitDefinitions: wireFormat.traitDefinitions,
			rules,
		};
	}
}

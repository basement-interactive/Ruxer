// SPDX-License-Identifier: AGPL-3.0-or-later

import type {LimitKey} from '@fluxer/constants/src/LimitConfigMetadata';

export interface LimitFilter {
	traits?: Array<string>;
	guildFeatures?: Array<string>;
}

export interface LimitRule {
	id: string;
	filters?: LimitFilter;
	limits: Partial<Record<LimitKey, number>>;
	modifiedFields?: Array<LimitKey>;
}

export interface LimitConfigSnapshot {
	version?: number;
	traitDefinitions: Array<string>;
	rules: Array<LimitRule>;
}

export interface LimitConfigWireFormat {
	version: 2;
	traitDefinitions: Array<string>;
	rules: Array<{
		id: string;
		filters?: LimitFilter;
		overrides: Partial<Record<LimitKey, number>>;
	}>;
	defaultsHash: string;
}

export interface LimitMatchContext {
	traits: Set<string>;
	guildFeatures: Set<string>;
}

export type EvaluationContext = 'user' | 'guild';

export interface LimitEvaluationOptions {
	evaluationContext?: EvaluationContext;
	baseLimits?: Record<LimitKey, number>;
}

export interface LimitEvaluationResult {
	limits: Record<LimitKey, number>;
}

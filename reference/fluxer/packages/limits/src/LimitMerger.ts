// SPDX-License-Identifier: AGPL-3.0-or-later

import type {LimitKey} from '@fluxer/constants/src/LimitConfigMetadata';
import {applyRuleToResolvedLimits} from '@fluxer/limits/src/LimitRuleRuntime';
import type {EvaluationContext, LimitRule} from '@fluxer/limits/src/LimitTypes';

export function mergeRuleIntoResolved(
	resolved: Record<LimitKey, number>,
	rule: LimitRule,
	evaluationContext: EvaluationContext,
): void {
	applyRuleToResolvedLimits(resolved, rule, evaluationContext);
}

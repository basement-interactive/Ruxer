// SPDX-License-Identifier: AGPL-3.0-or-later

import {ruleMatches as evaluateRuleMatch} from '@fluxer/limits/src/LimitRuleRuntime';
import type {LimitFilter, LimitMatchContext} from '@fluxer/limits/src/LimitTypes';

export function ruleMatches(filters: LimitFilter | undefined, ctx: LimitMatchContext): boolean {
	return evaluateRuleMatch(filters, ctx);
}

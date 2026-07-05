// SPDX-License-Identifier: AGPL-3.0-or-later

import type {TemplateCompiler} from '@fluxer/i18n/src/runtime/I18nTypes';
import type MessageFormat from '@messageformat/core';

export function compileTemplate<TValue, TVariables>(
	compiler: TemplateCompiler<TValue, TVariables>,
	template: TValue,
	variables: TVariables,
	mf: MessageFormat,
): TValue {
	return compiler(template, variables, mf);
}

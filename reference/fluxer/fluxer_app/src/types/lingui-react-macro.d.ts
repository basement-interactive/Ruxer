// SPDX-License-Identifier: AGPL-3.0-or-later

import type {MacroMessageDescriptor} from '@lingui/core/macro';
import type {I18nContext} from '@lingui/react';

declare module '@lingui/react/macro' {
	type LinguiMacroTagFunction = {
		(descriptor: MacroMessageDescriptor): string;
		(literals: TemplateStringsArray, ...placeholders: Array<unknown>): string;
	};
	export function useLingui(): Omit<I18nContext, '_'> & {
		t: LinguiMacroTagFunction;
	};
}

// SPDX-License-Identifier: AGPL-3.0-or-later

import React, {useContext} from 'react';

export interface AuthRegisterFormDraft {
	formValues: Record<string, string>;
	selectedMonth: string;
	selectedDay: string;
	selectedYear: string;
	consent: boolean;
}

export const EMPTY_AUTH_REGISTER_FORM_DRAFT: AuthRegisterFormDraft = {
	formValues: {},
	selectedMonth: '',
	selectedDay: '',
	selectedYear: '',
	consent: false,
};

interface AuthRegisterDraftContextType {
	getRegisterFormDraft: (draftKey: string) => AuthRegisterFormDraft | undefined;
	setRegisterFormDraft: (draftKey: string, draft: AuthRegisterFormDraft) => void;
	clearRegisterFormDraft: (draftKey: string) => void;
}

export const AuthRegisterDraftContext = React.createContext<AuthRegisterDraftContextType | null>(null);

export function useAuthRegisterDraftContext(): AuthRegisterDraftContextType {
	const context = useContext(AuthRegisterDraftContext);
	if (!context) {
		throw new Error('useAuthRegisterDraftContext must be used within AuthLayout');
	}
	return context;
}

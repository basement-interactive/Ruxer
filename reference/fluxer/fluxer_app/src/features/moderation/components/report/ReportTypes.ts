// SPDX-License-Identifier: AGPL-3.0-or-later

export type FlowStep = 'selection' | 'email' | 'verification' | 'details' | 'complete';
export type ReportType = 'message' | 'user' | 'guild';

export const INITIAL_FORM_VALUES = {
	category: '',
	reporterFullName: '',
	reporterCountry: '',
	reporterFluxerTag: '',
	messageLink: '',
	messageUserTag: '',
	userId: '',
	userTag: '',
	guildId: '',
	inviteCode: '',
	additionalInfo: '',
};

export type FormValues = typeof INITIAL_FORM_VALUES;

export interface State {
	selectedType: ReportType | null;
	flowStep: FlowStep;
	email: string;
	verificationCode: string;
	ticket: string | null;
	formValues: FormValues;
	isSendingCode: boolean;
	isVerifying: boolean;
	isSubmitting: boolean;
	errorMessage: string | null;
	successReportId: string | null;
	resendCooldownSeconds: number;
	fieldErrors: Partial<Record<keyof FormValues, string>>;
}

export type Action =
	| {
			type: 'RESET_ALL';
	  }
	| {
			type: 'SELECT_TYPE';
			reportType: ReportType;
	  }
	| {
			type: 'GO_TO_SELECTION';
	  }
	| {
			type: 'GO_TO_EMAIL';
	  }
	| {
			type: 'GO_TO_VERIFICATION';
	  }
	| {
			type: 'GO_TO_DETAILS';
	  }
	| {
			type: 'SET_ERROR';
			message: string | null;
	  }
	| {
			type: 'SET_EMAIL';
			email: string;
	  }
	| {
			type: 'SET_VERIFICATION_CODE';
			code: string;
	  }
	| {
			type: 'SET_TICKET';
			ticket: string | null;
	  }
	| {
			type: 'SET_FORM_FIELD';
			field: keyof FormValues;
			value: string;
	  }
	| {
			type: 'SENDING_CODE';
			value: boolean;
	  }
	| {
			type: 'VERIFYING';
			value: boolean;
	  }
	| {
			type: 'SUBMITTING';
			value: boolean;
	  }
	| {
			type: 'SUBMIT_SUCCESS';
			reportId: string;
	  }
	| {
			type: 'START_RESEND_COOLDOWN';
			seconds: number;
	  }
	| {
			type: 'TICK_RESEND_COOLDOWN';
	  }
	| {
			type: 'SET_FIELD_ERRORS';
			errors: Partial<Record<keyof FormValues, string>>;
	  }
	| {
			type: 'CLEAR_FIELD_ERRORS';
	  }
	| {
			type: 'CLEAR_FIELD_ERROR';
			field: keyof FormValues;
	  };

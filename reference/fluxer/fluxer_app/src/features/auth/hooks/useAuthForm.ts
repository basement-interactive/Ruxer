// SPDX-License-Identifier: AGPL-3.0-or-later

import {type UseFormReturn, useForm} from '@app/features/app/hooks/useForm';
import {CaptchaCancelledError, CaptchaValidationError} from '@app/features/auth/hooks/useCaptcha';
import * as RouterUtils from '@app/features/navigation/utils/RouterUtils';
import {HttpError} from '@app/features/platform/types/EndpointError';
import type {RestResponse} from '@app/features/platform/types/TransportTypes';
import {APIErrorCodes} from '@fluxer/constants/src/ApiErrorCodes';
import type {I18n} from '@lingui/core';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {useEffect, useState} from 'react';

const AN_UNEXPECTED_ERROR_OCCURRED_DESCRIPTOR = msg({
	message: 'An unexpected error occurred',
	comment: 'Short label in the authentication auth form. Keep the tone plain and specific.',
});

type AuthFormSubmitResult = false | undefined;

interface UseAuthFormOptions {
	initialValues: Record<string, string>;
	onSubmit: (values: Record<string, string>) => Promise<AuthFormSubmitResult>;
	redirectPath?: string;
	firstFieldName?: string;
}

interface ValidationError {
	path: string;
	message: string;
}

interface APIErrorResponse {
	code: string;
	message: string;
	errors?: Array<ValidationError>;
}

const isRestResponse = (value: unknown): value is RestResponse<unknown> =>
	typeof value === 'object' && value !== null && 'ok' in value && 'status' in value && 'body' in value;
const getErrorData = (error: unknown): APIErrorResponse | undefined => {
	if (error instanceof HttpError) {
		return error.body as APIErrorResponse | undefined;
	}
	if (isRestResponse(error)) {
		return error.body as APIErrorResponse | undefined;
	}
	if (typeof error === 'object' && error !== null && 'body' in error) {
		return (
			error as {
				body?: APIErrorResponse;
			}
		).body;
	}
	return undefined;
};

export function useAuthForm({initialValues, onSubmit, redirectPath, firstFieldName}: UseAuthFormOptions) {
	const {i18n} = useLingui();
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [fieldErrors, setFieldErrors] = useState<Record<string, string> | null>(null);
	const form = useForm({
		initialValues,
		onSubmit: async (values) => {
			setIsLoading(true);
			setError(null);
			setFieldErrors(null);
			try {
				const shouldRedirect = await onSubmit(values);
				if (shouldRedirect !== false && redirectPath) {
					RouterUtils.replaceWith(redirectPath);
				}
			} catch (err) {
				if (err instanceof CaptchaCancelledError) {
					return;
				}
				if (err instanceof CaptchaValidationError) {
					return;
				}
				extractErrors(err, setError, setFieldErrors, form, i18n, firstFieldName);
			} finally {
				setIsLoading(false);
			}
		},
	});
	useEffect(() => {
		setError(null);
		setFieldErrors(null);
	}, []);
	return {
		form,
		isLoading,
		error,
		fieldErrors,
	};
}

export const getAuthErrorMessage = (error: unknown, i18n?: I18n): string => {
	const errorData = getErrorData(error);
	const unexpected = i18n ? i18n._(AN_UNEXPECTED_ERROR_OCCURRED_DESCRIPTOR) : 'An unexpected error occurred';
	const fallbackMessage = error instanceof Error ? error.message : unexpected;
	return errorData?.message || fallbackMessage;
};
const extractErrors = (
	error: unknown,
	setError: (error: string | null) => void,
	setFieldErrors: (errors: Record<string, string> | null) => void,
	form: UseFormReturn,
	i18n: I18n,
	firstFieldName?: string,
) => {
	const errorData = getErrorData(error);
	if (errorData?.code === APIErrorCodes.INVALID_FORM_BODY && errorData.errors?.length) {
		const fieldErrors = errorData.errors.reduce(
			(acc, {path, message}) => {
				acc[path] = acc[path] ? `${acc[path]} ${message}` : message;
				return acc;
			},
			{} as Record<string, string>,
		);
		setFieldErrors(fieldErrors);
		form.setErrors(fieldErrors);
		return;
	}
	const message = getAuthErrorMessage(error, i18n);
	if (firstFieldName) {
		const fieldErrors = {[firstFieldName]: message};
		setFieldErrors(fieldErrors);
		form.setErrors(fieldErrors);
	} else {
		setError(message);
	}
};

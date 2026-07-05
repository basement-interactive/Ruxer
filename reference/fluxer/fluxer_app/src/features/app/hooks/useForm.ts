// SPDX-License-Identifier: AGPL-3.0-or-later

import type {FormEvent} from 'react';
import {useCallback, useState} from 'react';

interface FormField {
	value: string;
	error?: string;
}

interface FormState {
	[key: string]: FormField;
}

interface UseFormOptions {
	initialValues?: Record<string, string>;
	onSubmit: (values: Record<string, string>) => Promise<void>;
}

export interface UseFormReturn {
	setValue: (fieldName: string, value: string) => void;
	setError: (fieldName: string, error: string) => void;
	setErrors: (errors: Record<string, string>) => void;
	getValue: (fieldName: string) => string;
	getError: (fieldName: string) => string | undefined;
	handleSubmit: (e?: FormEvent) => Promise<void>;
	isSubmitting: boolean;
}

export function useForm({initialValues = {}, onSubmit}: UseFormOptions): UseFormReturn {
	const [fields, setFields] = useState<FormState>(() => {
		const initial: FormState = {};
		for (const [key, value] of Object.entries(initialValues)) {
			initial[key] = {value};
		}
		return initial;
	});
	const [isSubmitting, setIsSubmitting] = useState(false);
	const setValue = useCallback((fieldName: string, value: string) => {
		setFields((prev) => ({
			...prev,
			[fieldName]: {...prev[fieldName], value, error: undefined},
		}));
	}, []);
	const setError = useCallback((fieldName: string, error: string) => {
		setFields((prev) => ({
			...prev,
			[fieldName]: {...prev[fieldName], error},
		}));
	}, []);
	const setErrors = useCallback((errors: Record<string, string>) => {
		setFields((prev) => {
			const updated = {...prev};
			for (const [fieldName, error] of Object.entries(errors)) {
				updated[fieldName] = {...updated[fieldName], error};
			}
			return updated;
		});
	}, []);
	const getValue = useCallback((fieldName: string): string => fields[fieldName]?.value || '', [fields]);
	const getError = useCallback((fieldName: string): string | undefined => fields[fieldName]?.error, [fields]);
	const getValues = useCallback((): Record<string, string> => {
		const values: Record<string, string> = {};
		for (const [key, field] of Object.entries(fields)) {
			values[key] = field.value;
		}
		return values;
	}, [fields]);
	const handleSubmit = useCallback(
		async (e?: FormEvent) => {
			e?.preventDefault();
			setIsSubmitting(true);
			try {
				await onSubmit(getValues());
			} finally {
				setIsSubmitting(false);
			}
		},
		[onSubmit, getValues],
	);
	return {
		setValue,
		setError,
		setErrors,
		getValue,
		getError,
		handleSubmit,
		isSubmitting,
	};
}

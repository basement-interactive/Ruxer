// SPDX-License-Identifier: AGPL-3.0-or-later

import {observer} from 'mobx-react-lite';
import type {FieldValues, UseFormReturn} from 'react-hook-form';

type FormProps<T extends FieldValues> = Omit<React.HTMLAttributes<HTMLFormElement>, 'onSubmit'> & {
	form: UseFormReturn<T>;
	onSubmit: (values: T) => void;
	'aria-label'?: string;
	'aria-labelledby'?: string;
};

export const Form = observer(
	<T extends FieldValues>({
		form,
		onSubmit,
		children,
		'aria-label': ariaLabel,
		'aria-labelledby': ariaLabelledBy,
		...props
	}: FormProps<T>) => (
		<form
			data-flx="ui.form.form.form.prevent-default"
			{...props}
			aria-label={ariaLabel || undefined}
			aria-labelledby={ariaLabelledBy || undefined}
			style={{display: 'contents', ...props.style}}
			onSubmit={(event) => {
				event.preventDefault();
				form.clearErrors();
				form.handleSubmit(onSubmit)(event);
			}}
		>
			{children}
		</form>
	),
);

// SPDX-License-Identifier: AGPL-3.0-or-later

import {APIErrorCodes} from '@fluxer/constants/src/ApiErrorCodes';
import {HttpStatus} from '@fluxer/constants/src/HttpConstants';
import {FluxerError} from '@fluxer/errors/src/FluxerError';

interface FieldError {
	field: string;
	code: string;
	message: string;
}

interface ValidationErrorOptions {
	code?: string;
	message?: string;
	errors: Array<FieldError>;
}

export class ValidationError extends FluxerError {
	readonly errors: Array<FieldError>;

	constructor(options: ValidationErrorOptions) {
		super({
			code: options.code ?? APIErrorCodes.VALIDATION_ERROR,
			message: options.message ?? 'Validation failed',
			status: HttpStatus.BAD_REQUEST,
			data: {errors: options.errors},
		});
		this.name = 'ValidationError';
		this.errors = options.errors;
	}

	override getResponse(): Response {
		return new Response(
			JSON.stringify({
				code: this.code,
				message: this.message,
				errors: this.errors,
			}),
			{
				status: this.status,
				headers: {
					'Content-Type': 'application/json',
				},
			},
		);
	}

	static fromField(field: string, code: string, message: string): ValidationError {
		return new ValidationError({
			errors: [{field, code, message}],
		});
	}

	static fromFields(errors: Array<FieldError>): ValidationError {
		return new ValidationError({errors});
	}
}

// SPDX-License-Identifier: AGPL-3.0-or-later

import {ValidationErrorCodes} from '@fluxer/constants/src/ValidationErrorCodes';
import {z} from 'zod';

const TRUE_VALUES = ['true', 'True', '1'];
const ISO_TIMESTAMP_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?$/;
export const QueryBooleanType = z
	.string()
	.trim()
	.optional()
	.default('false')
	.transform((value) => TRUE_VALUES.includes(value));

export function createQueryIntegerType({defaultValue = 0, minValue = 0, maxValue = 2147483647} = {}) {
	return z
		.string()
		.trim()
		.optional()
		.default(defaultValue.toString())
		.superRefine((value, ctx) => {
			const num = Number.parseInt(value, 10);
			if (Number.isNaN(num)) {
				ctx.addIssue({
					code: 'custom',
					message: ValidationErrorCodes.VALUE_MUST_BE_INTEGER_IN_RANGE,
					params: {minValue, maxValue},
				});
				return z.NEVER;
			}
			if (!Number.isInteger(num) || num < minValue || num > maxValue) {
				ctx.addIssue({
					code: 'custom',
					message: ValidationErrorCodes.VALUE_MUST_BE_INTEGER_IN_RANGE,
					params: {minValue, maxValue},
				});
				return z.NEVER;
			}
		})
		.transform((value) => {
			const num = Number.parseInt(value, 10);
			if (Number.isNaN(num)) {
				throw new Error(ValidationErrorCodes.VALUE_MUST_BE_INTEGER_IN_RANGE);
			}
			return num;
		});
}

export const DateTimeType = z.union([
	z
		.string()
		.regex(ISO_TIMESTAMP_REGEX, ValidationErrorCodes.INVALID_ISO_TIMESTAMP)
		.superRefine((value, ctx) => {
			const date = new Date(value);
			if (Number.isNaN(date.getTime())) {
				ctx.addIssue({
					code: 'custom',
					message: ValidationErrorCodes.INVALID_ISO_TIMESTAMP,
				});
				return z.NEVER;
			}
		})
		.transform((value) => new Date(value)),
	z
		.number()
		.int()
		.min(0)
		.max(8640000000000000)
		.superRefine((value, ctx) => {
			const date = new Date(value);
			if (Number.isNaN(date.getTime())) {
				ctx.addIssue({
					code: 'custom',
					message: ValidationErrorCodes.INVALID_ISO_TIMESTAMP,
				});
				return z.NEVER;
			}
		})
		.transform((value) => new Date(value)),
]);

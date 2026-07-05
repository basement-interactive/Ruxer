// SPDX-License-Identifier: AGPL-3.0-or-later

import {HttpStatus} from '@fluxer/constants/src/HttpConstants';
import {CaptchaRequiredError, InvalidCaptchaError} from '@fluxer/errors/src/CaptchaErrors';
import {BadRequestError} from '@fluxer/errors/src/domains/core/BadRequestError';
import {FluxerError} from '@fluxer/errors/src/FluxerError';
import {ErrorCodeToI18nKey} from '@fluxer/errors/src/i18n/ErrorCodeMappings';
import {getErrorMessage} from '@fluxer/errors/src/i18n/ErrorI18n';
import type {ErrorI18nKey} from '@fluxer/errors/src/i18n/ErrorI18nTypes.generated';
import {describe, expect, it} from 'vitest';

describe('CaptchaErrors', () => {
	describe('CaptchaRequiredError', () => {
		it('should have correct code and name', () => {
			const error = new CaptchaRequiredError();
			expect(error.code).toBe('CAPTCHA_REQUIRED');
			expect(error.name).toBe('CaptchaRequiredError');
		});
		it('should have status 400', () => {
			const error = new CaptchaRequiredError();
			expect(error.status).toBe(HttpStatus.BAD_REQUEST);
		});
		it('should extend BadRequestError', () => {
			const error = new CaptchaRequiredError();
			expect(error).toBeInstanceOf(BadRequestError);
		});
		it('should extend FluxerError', () => {
			const error = new CaptchaRequiredError();
			expect(error).toBeInstanceOf(FluxerError);
		});
		it('should have an i18n mapping that resolves to the correct message', () => {
			const error = new CaptchaRequiredError();
			const i18nKey = ErrorCodeToI18nKey[error.code as keyof typeof ErrorCodeToI18nKey] as ErrorI18nKey;
			expect(i18nKey).toBe('captcha.required');
			expect(getErrorMessage(i18nKey, 'en-US')).toBe('Captcha is required.');
		});
	});
	describe('InvalidCaptchaError', () => {
		it('should have correct code and name', () => {
			const error = new InvalidCaptchaError();
			expect(error.code).toBe('INVALID_CAPTCHA');
			expect(error.name).toBe('InvalidCaptchaError');
		});
		it('should have status 400', () => {
			const error = new InvalidCaptchaError();
			expect(error.status).toBe(HttpStatus.BAD_REQUEST);
		});
		it('should extend BadRequestError', () => {
			const error = new InvalidCaptchaError();
			expect(error).toBeInstanceOf(BadRequestError);
		});
		it('should extend FluxerError', () => {
			const error = new InvalidCaptchaError();
			expect(error).toBeInstanceOf(FluxerError);
		});
		it('should have an i18n mapping that resolves to the correct message', () => {
			const error = new InvalidCaptchaError();
			const i18nKey = ErrorCodeToI18nKey[error.code as keyof typeof ErrorCodeToI18nKey] as ErrorI18nKey;
			expect(i18nKey).toBe('captcha.invalid');
			expect(getErrorMessage(i18nKey, 'en-US')).toBe('Invalid captcha.');
		});
	});
	describe('error differentiation', () => {
		it('should have different codes for required vs invalid', () => {
			const requiredError = new CaptchaRequiredError();
			const invalidError = new InvalidCaptchaError();
			expect(requiredError.code).not.toBe(invalidError.code);
		});
		it('should have different i18n messages for required vs invalid', () => {
			const requiredKey = ErrorCodeToI18nKey['CAPTCHA_REQUIRED'] as ErrorI18nKey;
			const invalidKey = ErrorCodeToI18nKey['INVALID_CAPTCHA'] as ErrorI18nKey;
			expect(getErrorMessage(requiredKey, 'en-US')).not.toBe(getErrorMessage(invalidKey, 'en-US'));
		});
		it('should have different names for required vs invalid', () => {
			const requiredError = new CaptchaRequiredError();
			const invalidError = new InvalidCaptchaError();
			expect(requiredError.name).not.toBe(invalidError.name);
		});
	});
});

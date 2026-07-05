// SPDX-License-Identifier: AGPL-3.0-or-later

export class CaptchaCancelledError extends Error {
	constructor() {
		super('Captcha cancelled');
		this.name = 'CaptchaCancelledError';
	}
}

export class CaptchaValidationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'CaptchaValidationError';
	}
}

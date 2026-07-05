// SPDX-FileCopyrightText: 2024 LiveKit, Inc.
//
// SPDX-License-Identifier: Apache-2.0
import {LivekitError} from '../room/errors.ts';

export enum CryptorErrorReason {
	InvalidKey = 0,
	MissingKey = 1,
	InternalError = 2,
}

export class CryptorError extends LivekitError {
	reason: CryptorErrorReason;

	participantIdentity?: string;

	constructor(
		message?: string,
		reason: CryptorErrorReason = CryptorErrorReason.InternalError,
		participantIdentity?: string,
	) {
		super(40, message);
		this.reason = reason;
		this.participantIdentity = participantIdentity;
	}
}

// SPDX-FileCopyrightText: 2024 LiveKit, Inc.
//
// SPDX-License-Identifier: Apache-2.0
import {extractProjectFromUrl, sleep} from './utils.ts';

const CONNECTION_BACKOFF_MIN_MS = 500;
const CONNECTION_BACKOFF_MAX_MS = 15_000;

export class BackOffStrategy {
	private static _instance: BackOffStrategy | null = null;

	private failedConnectionAttempts = new Map<string, number>();

	private backOffPromises = new Map<string, Promise<void>>();

	private constructor() {}

	static getInstance(): BackOffStrategy {
		if (!BackOffStrategy._instance) {
			BackOffStrategy._instance = new BackOffStrategy();
		}
		return BackOffStrategy._instance;
	}

	addFailedConnectionAttempt(urlString: string) {
		const url = new URL(urlString);
		const projectName = extractProjectFromUrl(url);
		if (!projectName) {
			return;
		}
		const failureCount = this.failedConnectionAttempts.get(projectName) ?? 0;
		this.failedConnectionAttempts.set(projectName, failureCount + 1);
		this.backOffPromises.set(
			projectName,
			sleep(Math.min(CONNECTION_BACKOFF_MIN_MS * 2 ** failureCount, CONNECTION_BACKOFF_MAX_MS)),
		);
	}

	getBackOffPromise(urlString: string): Promise<void> {
		const url = new URL(urlString);
		const projectName = url && extractProjectFromUrl(url);
		const backoffPromise = projectName && this.backOffPromises.get(projectName);
		return backoffPromise || Promise.resolve();
	}

	resetFailedConnectionAttempts(urlString: string) {
		const url = new URL(urlString);
		const projectName = url && extractProjectFromUrl(url);
		if (projectName) {
			this.failedConnectionAttempts.set(projectName, 0);
			this.backOffPromises.set(projectName, Promise.resolve());
		}
	}

	resetAll() {
		this.backOffPromises.clear();
		this.failedConnectionAttempts.clear();
	}
}

// SPDX-License-Identifier: AGPL-3.0-or-later

import {Store} from '@app/features/voice/engine/Store';

const CONNECT_THROTTLE_MS = 1000;

export interface ConnectionThrottleState {
	lastConnectRequestAt: number | null;
	connectAttemptId: number;
	inFlightConnect: boolean;
}

const initialThrottleState: ConnectionThrottleState = {
	lastConnectRequestAt: null,
	connectAttemptId: 0,
	inFlightConnect: false,
};

export class VoiceConnectionThrottle extends Store {
	throttleState: ConnectionThrottleState = initialThrottleState;

	get connectAttemptId(): number {
		return this.throttleState.connectAttemptId;
	}

	get inFlightConnect(): boolean {
		return this.throttleState.inFlightConnect;
	}

	shouldThrottle(): boolean {
		const now = Date.now();
		const last = this.throttleState.lastConnectRequestAt ?? 0;
		return now - last < CONNECT_THROTTLE_MS;
	}

	isLatestAttempt(id: number): boolean {
		return id === this.throttleState.connectAttemptId;
	}

	setLatestAttemptId(id: number): void {
		this.update(() => {
			this.throttleState = {
				...this.throttleState,
				connectAttemptId: id,
			};
		});
	}

	recordConnectRequest(): void {
		this.update(() => {
			this.throttleState = {
				...this.throttleState,
				lastConnectRequestAt: Date.now(),
			};
		});
	}

	incrementAttemptId(): void {
		this.update(() => {
			this.throttleState = {
				...this.throttleState,
				connectAttemptId: this.throttleState.connectAttemptId + 1,
			};
		});
	}

	setInFlightConnect(value: boolean): void {
		this.update(() => {
			this.throttleState = {
				...this.throttleState,
				inFlightConnect: value,
			};
		});
	}

	reset(): void {
		this.update(() => {
			this.throttleState = initialThrottleState;
		});
	}
}

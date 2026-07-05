// SPDX-FileCopyrightText: 2024 LiveKit, Inc.
//
// SPDX-License-Identifier: Apache-2.0
type ObjectTimerHandle = {
	hasRef?: () => boolean;
	ref?: () => ObjectTimerHandle;
	refresh?: () => ObjectTimerHandle;
	unref?: () => ObjectTimerHandle;
	[Symbol.toPrimitive]?: () => number;
};

type TimerCallback = (...args: Array<never>) => void;
type TimerHandler = TimerCallback | string;

export type TimerHandle = number | ObjectTimerHandle;
export type SetTimer = (handler: TimerHandler, timeout?: number, ...args: Array<unknown>) => TimerHandle;
export type ClearTimer = (handle?: TimerHandle) => void;

const nativeSetTimeout = globalThis.setTimeout.bind(globalThis) as SetTimer;
const nativeSetInterval = globalThis.setInterval.bind(globalThis) as SetTimer;
const nativeClearTimeout = globalThis.clearTimeout.bind(globalThis) as ClearTimer;
const nativeClearInterval = globalThis.clearInterval.bind(globalThis) as ClearTimer;

// biome-ignore lint/complexity/noStaticOnlyClass: Timer hooks are mutable static properties by design.
export default class CriticalTimers {
	static setTimeout: SetTimer = nativeSetTimeout;

	static setInterval: SetTimer = nativeSetInterval;

	static clearTimeout: ClearTimer = nativeClearTimeout;

	static clearInterval: ClearTimer = nativeClearInterval;
}

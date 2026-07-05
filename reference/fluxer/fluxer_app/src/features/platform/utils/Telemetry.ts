// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Thin accessors for the desktop error-telemetry consent, backed by Tauri
// commands (telemetry_get_enabled / telemetry_set_enabled). The Rust side is
// the source of truth (it persists consent and gates the webhook); these just
// let the Settings UI read/toggle it. No-ops / null off-desktop.

import {isDesktop} from '@app/features/ui/utils/NativeUtils';
import {notifyTelemetryConsentChanged} from '@app/desktop-tauri-shim';

type TauriInvoke = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

function invoke(): TauriInvoke | null {
	const t = (window as unknown as {__TAURI__?: {core: {invoke: TauriInvoke}}}).__TAURI__;
	return t?.core?.invoke ?? null;
}

/** `null` = never asked / not desktop; otherwise the stored consent. */
export async function getTelemetryEnabled(): Promise<boolean | null> {
	if (!isDesktop()) return null;
	const inv = invoke();
	if (!inv) return null;
	try {
		return (await inv<boolean | null>('telemetry_get_enabled')) ?? null;
	} catch {
		return null;
	}
}

export async function setTelemetryEnabled(enabled: boolean): Promise<void> {
	const inv = invoke();
	if (!inv) return;
	try {
		await inv('telemetry_set_enabled', {enabled});
		// Keep desktop-tauri-shim's in-memory gate (checked on every
		// console.error) in sync immediately — otherwise flipping this off
		// wouldn't take effect until some unrelated reload.
		notifyTelemetryConsentChanged(enabled);
	} catch {
		/* best effort */
	}
}

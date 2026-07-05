// SPDX-License-Identifier: AGPL-3.0-or-later

export interface DesktopSourceIntent {
	sourceId: string;
	includeAudio: boolean;
}

interface StoredIntent extends DesktopSourceIntent {
	expiresAt: number;
}

const INTENT_TTL_MS = 30000;

let pendingIntent: StoredIntent | null = null;

export function setDesktopSourceIntent(intent: DesktopSourceIntent): void {
	pendingIntent = {...intent, expiresAt: Date.now() + INTENT_TTL_MS};
}

export function consumeDesktopSourceIntent(): DesktopSourceIntent | null {
	if (!pendingIntent) return null;
	const now = Date.now();
	const {expiresAt, ...intent} = pendingIntent;
	pendingIntent = null;
	if (expiresAt < now) {
		return null;
	}
	return intent;
}

export function clearDesktopSourceIntent(): void {
	pendingIntent = null;
}

// SPDX-License-Identifier: AGPL-3.0-or-later

export interface ScreenShareAudioCaptureDebugInfo {
	captureId?: string | null;
	platform?: string | null;
	sourceId?: string | null;
	sourceKind?: string | null;
	sourceMode?: string | null;
	backend?: string | null;
	reason?: string | null;
	detail?: string | null;
}

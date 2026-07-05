// SPDX-License-Identifier: AGPL-3.0-or-later

export function getNativeAudioErrorDetail(error: unknown): string {
	if (error instanceof Error) return error.message;
	return String(error);
}

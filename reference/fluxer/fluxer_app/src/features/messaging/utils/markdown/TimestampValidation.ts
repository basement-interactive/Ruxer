// SPDX-License-Identifier: AGPL-3.0-or-later

const MILLISECONDS_PER_SECOND = 1000;

export function getDateFromUnixTimestampSeconds(timestamp: number): Date | null {
	if (!Number.isFinite(timestamp)) {
		return null;
	}
	const timestampMillis = timestamp * MILLISECONDS_PER_SECOND;
	if (!Number.isFinite(timestampMillis)) {
		return null;
	}
	const date = new Date(timestampMillis);
	if (Number.isNaN(date.getTime())) {
		return null;
	}
	return date;
}

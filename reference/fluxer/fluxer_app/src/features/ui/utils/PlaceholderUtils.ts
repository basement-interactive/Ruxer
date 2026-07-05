// SPDX-License-Identifier: AGPL-3.0-or-later

const truncateText = (value: string, maxLength: number): string => {
	if (maxLength <= 0) return '';
	if (value.length <= maxLength) return value;
	if (maxLength <= 3) return value.slice(0, maxLength);
	return `${value.slice(0, maxLength - 3)}...`;
};

export function getChannelPlaceholder(channelName: string, prefix: string, maxLength: number): string {
	const availableLength = maxLength - prefix.length;
	if (availableLength <= 0) {
		return prefix;
	}
	const truncatedName = truncateText(channelName, availableLength);
	return prefix + truncatedName;
}

export function getDMPlaceholder(username: string, prefix: string, maxLength: number): string {
	const availableLength = maxLength - prefix.length;
	if (availableLength <= 0) {
		return prefix;
	}
	const truncatedName = truncateText(username, availableLength);
	return prefix + truncatedName;
}

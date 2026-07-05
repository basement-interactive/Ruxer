// SPDX-License-Identifier: AGPL-3.0-or-later

const GROUP_DM_COLORS = ['#2563EB', '#7C3AED', '#C026D3', '#E11D48', '#EA580C', '#059669', '#0D9488', '#0E7490'];
const hashString = (value: string): number => {
	let hash = 0;
	for (let i = 0; i < value.length; i += 1) {
		hash = (hash << 5) - hash + value.charCodeAt(i);
		hash |= 0;
	}
	return hash;
};

export function getGroupDMAccentColor(channelId: string): string {
	if (!channelId) {
		return GROUP_DM_COLORS[0]!;
	}
	const hash = Math.abs(hashString(channelId));
	return GROUP_DM_COLORS[hash % GROUP_DM_COLORS.length]!;
}

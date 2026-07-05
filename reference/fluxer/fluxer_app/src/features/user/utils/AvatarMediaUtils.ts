// SPDX-License-Identifier: AGPL-3.0-or-later

import type {MediaProxyImageSize} from '@fluxer/constants/src/MediaProxyImageSizes';

const DEFAULT_AVATAR_PRIMARY_COLORS = [0x4641d9, 0xf0b100, 0x00bba7, 0x2b7fff, 0xad46ff, 0x6a7282];
export const DEFAULT_AVATAR_COUNT = BigInt(DEFAULT_AVATAR_PRIMARY_COLORS.length);
export const normalizeEndpoint = (endpoint: string): string => endpoint.replace(/\/$/, '');
export const parseAvatarHash = (value: string) => {
	const animated = value.startsWith('a_');
	const hash = animated ? value.slice(2) : value;
	return {animated, hash};
};
export const buildMediaUrl = ({
	endpoint,
	path,
	id,
	hash,
	size,
	animated,
}: {
	endpoint: string;
	path: string;
	id: string;
	hash: string;
	size: MediaProxyImageSize;
	animated?: boolean;
}) => {
	const normalizedEndpoint = normalizeEndpoint(endpoint);
	const query = animated ? `size=${size}&animated=true` : `size=${size}`;
	return `${normalizedEndpoint}/${path}/${id}/${hash}.webp?${query}`;
};
export const getDefaultAvatarIndex = (id: string): number => Number(BigInt(id) % DEFAULT_AVATAR_COUNT);
export const getDefaultAvatarPrimaryColor = (id: string): number =>
	DEFAULT_AVATAR_PRIMARY_COLORS[getDefaultAvatarIndex(id)];

// SPDX-License-Identifier: AGPL-3.0-or-later

import type {ValueOf} from '@fluxer/constants/src/ValueOf';

export const JumpTypes = {
	ANIMATED: 'ANIMATED',
	INSTANT: 'INSTANT',
	NONE: 'NONE',
} as const;

export type JumpType = ValueOf<typeof JumpTypes>;

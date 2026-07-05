// SPDX-License-Identifier: AGPL-3.0-or-later

import React from 'react';

export interface FrameSides {
	top?: boolean;
	right?: boolean;
	bottom?: boolean;
	left?: boolean;
}

export const FrameContext = React.createContext<FrameSides | null>(null);

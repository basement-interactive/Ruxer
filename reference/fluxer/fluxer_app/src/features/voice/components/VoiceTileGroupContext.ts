// SPDX-License-Identifier: AGPL-3.0-or-later

import {createContext, useContext} from 'react';

export interface VoiceTileGroupContextValue {
	hiddenConnectionCount: number;
	deviceConnectionCount: number;
	isExpanded: boolean;
	isPrimary: boolean;
	onExpand: () => void;
	userId: string | null;
}

export const VoiceTileGroupContext = createContext<VoiceTileGroupContextValue | null>(null);

export function useVoiceTileGroup(): VoiceTileGroupContextValue | null {
	return useContext(VoiceTileGroupContext);
}

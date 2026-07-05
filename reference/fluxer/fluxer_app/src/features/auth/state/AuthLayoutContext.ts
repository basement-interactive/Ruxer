// SPDX-License-Identifier: AGPL-3.0-or-later

import type {GuildSplashCardAlignmentValue} from '@fluxer/constants/src/GuildConstants';
import React, {useContext} from 'react';

export type AuthCardVariant = 'default' | 'standard' | 'compact' | 'wide';

interface AuthLayoutContextType {
	setSplashUrl: (url: string | null) => void;
	setShowLogoSide: (show: boolean) => void;
	setCardVariant: React.Dispatch<React.SetStateAction<AuthCardVariant>>;
	setSplashCardAlignment: React.Dispatch<React.SetStateAction<GuildSplashCardAlignmentValue>>;
}

export const AuthLayoutContext = React.createContext<AuthLayoutContextType | null>(null);
export const useAuthLayoutContext = () => {
	const context = useContext(AuthLayoutContext);
	if (!context) {
		throw new Error('useAuthLayoutContext must be used within AuthLayoutProvider');
	}
	return context;
};

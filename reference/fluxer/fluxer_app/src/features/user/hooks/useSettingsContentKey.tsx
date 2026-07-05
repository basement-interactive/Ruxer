// SPDX-License-Identifier: AGPL-3.0-or-later

import React, {useCallback, useContext, useMemo, useState} from 'react';

interface SettingsContentKeyContextValue {
	contentKey: string | null;
	setContentKey: (key: string | null) => void;
	resetContentKey: () => void;
}

const SettingsContentKeyContext = React.createContext<SettingsContentKeyContextValue | null>(null);
export const SettingsContentKeyProvider: React.FC<{children: React.ReactNode}> = ({children}) => {
	const [contentKey, setContentKey] = useState<string | null>(null);
	const handleSetContentKey = useCallback((key: string | null) => {
		setContentKey(key);
	}, []);
	const resetContentKey = useCallback(() => {
		setContentKey(null);
	}, []);
	const value = useMemo(
		() => ({
			contentKey,
			setContentKey: handleSetContentKey,
			resetContentKey,
		}),
		[contentKey, handleSetContentKey, resetContentKey],
	);
	return <SettingsContentKeyContext.Provider value={value}>{children}</SettingsContentKeyContext.Provider>;
};
export const useSettingsContentKey = (): SettingsContentKeyContextValue => {
	const context = useContext(SettingsContentKeyContext);
	if (!context) {
		return {
			contentKey: null,
			setContentKey: () => {},
			resetContentKey: () => {},
		};
	}
	return context;
};

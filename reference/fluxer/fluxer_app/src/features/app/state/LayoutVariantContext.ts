// SPDX-License-Identifier: AGPL-3.0-or-later

import React, {useContext} from 'react';

export type LayoutVariant = 'app' | 'auth' | 'call';

interface LayoutVariantContextValue {
	variant: LayoutVariant;
	setVariant: (variant: LayoutVariant) => void;
}

const defaultValue: LayoutVariantContextValue = {
	variant: 'app',
	setVariant: () => {},
};
const LayoutVariantContext = React.createContext<LayoutVariantContextValue>(defaultValue);
export const LayoutVariantProvider = LayoutVariantContext.Provider;
export const useLayoutVariant = () => useContext(LayoutVariantContext).variant;
export const useSetLayoutVariant = () => useContext(LayoutVariantContext).setVariant;

// SPDX-License-Identifier: AGPL-3.0-or-later

import {type AuthCardVariant, useAuthLayoutContext} from '@app/features/auth/state/AuthLayoutContext';
import {useEffect} from 'react';

interface AuthCardPresentationOptions {
	showLogoSide?: boolean;
	variant?: AuthCardVariant;
}

export function useAuthCardPresentation({showLogoSide = true, variant = 'default'}: AuthCardPresentationOptions): void {
	const {setCardVariant, setShowLogoSide} = useAuthLayoutContext();
	useEffect(() => {
		setShowLogoSide(showLogoSide);
		setCardVariant(variant);
		return () => {
			setShowLogoSide(true);
			setCardVariant('default');
		};
	}, [setCardVariant, setShowLogoSide, showLogoSide, variant]);
}

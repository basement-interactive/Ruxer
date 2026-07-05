// SPDX-License-Identifier: AGPL-3.0-or-later

import Accessibility from '@app/features/accessibility/state/Accessibility';
import {useAnimatedMediaPlaybackAllowed} from '@app/features/app/hooks/useAnimatedMediaPlayback';

export function useAutoplayExpandedProfileAnimations(): boolean {
	const animatedMediaPlaybackAllowed = useAnimatedMediaPlaybackAllowed();
	const prefersReducedMotion = Accessibility.useReducedMotion;
	return animatedMediaPlaybackAllowed && !prefersReducedMotion;
}

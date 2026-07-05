// SPDX-License-Identifier: AGPL-3.0-or-later

import {ACTIVE_RING_CONTEXT_MANAGER} from '@app/features/ui/focus_ring/FocusRingContext';

class FocusRingManagerClass {
	ringsEnabled = true;

	setRingsEnabled(enabled: boolean) {
		this.ringsEnabled = enabled;
		if (!enabled) {
			ACTIVE_RING_CONTEXT_MANAGER?.hide();
		}
	}
}

const FocusRingManager = new FocusRingManagerClass();

export default FocusRingManager;

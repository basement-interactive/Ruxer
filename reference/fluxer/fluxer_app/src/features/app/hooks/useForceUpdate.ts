// SPDX-License-Identifier: AGPL-3.0-or-later

import {useCallback, useState} from 'react';

export function useForceUpdate() {
	const [, setState] = useState<object>({});
	return useCallback(() => setState({}), []);
}

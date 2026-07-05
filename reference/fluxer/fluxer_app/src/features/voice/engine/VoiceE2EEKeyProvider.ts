// SPDX-License-Identifier: AGPL-3.0-or-later

import {ExternalE2EEKeyProvider} from 'livekit-client';

export function createE2EEWorker(): Worker {
	return new Worker(
		new URL(/* webpackChunkName: "livekit-e2ee.worker" */ 'livekit-client/e2ee-worker', import.meta.url),
		{
			type: 'module',
			name: 'livekit-e2ee-worker',
		},
	);
}

export function createE2EEKeyProvider(): ExternalE2EEKeyProvider {
	return new ExternalE2EEKeyProvider();
}

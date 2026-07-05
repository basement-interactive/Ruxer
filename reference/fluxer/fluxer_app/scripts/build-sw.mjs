// SPDX-License-Identifier: AGPL-3.0-or-later

import {buildServiceWorker} from './build/utils/ServiceWorker';

const isProduction = process.env.NODE_ENV === 'production';

buildServiceWorker(isProduction).catch((error) => {
	console.error('Service worker build failed:', error);
	process.exit(1);
});

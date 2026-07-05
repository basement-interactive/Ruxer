// SPDX-License-Identifier: AGPL-3.0-or-later

import {Logger} from '@app/features/platform/utils/AppLogger';
import {makeAutoObservable} from 'mobx';

const logger = new Logger('CountryCode');

class CountryCode {
	countryCode = 'US';

	constructor() {
		makeAutoObservable(this, {}, {autoBind: true});
	}

	setCountryCode(countryCode: string): void {
		this.countryCode = countryCode;
		logger.debug(`Set country code: ${countryCode}`);
	}
}

export default new CountryCode();

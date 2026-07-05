// SPDX-License-Identifier: AGPL-3.0-or-later

import {Logger} from '@app/features/platform/utils/AppLogger';
import type {RtcRegionResponse} from '@fluxer/schema/src/domains/channel/ChannelSchemas';
import {makeAutoObservable} from 'mobx';

const logger = new Logger('RtcRegions');

class RtcRegions {
	private regions: Array<RtcRegionResponse> = [];

	constructor() {
		makeAutoObservable(this, {}, {autoBind: true});
	}

	setRegions(regions: Array<RtcRegionResponse>): void {
		this.regions = regions;
		logger.debug(`Set RTC regions (${this.regions.length})`);
	}

	getRegions(): Array<RtcRegionResponse> {
		return this.regions;
	}
}

export default new RtcRegions();

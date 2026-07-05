// SPDX-License-Identifier: AGPL-3.0-or-later

import {Logger} from '@app/features/platform/utils/AppLogger';
import {makeAutoObservable} from 'mobx';

const logger = new Logger('Autocomplete');

class Autocomplete {
	highlightChannelId: string | null = null;

	constructor() {
		makeAutoObservable(this, {}, {autoBind: true});
	}

	highlightChannel(channelId: string): void {
		if (!channelId || this.highlightChannelId === channelId) {
			return;
		}
		this.highlightChannelId = channelId;
		logger.debug(`Highlighted channel: ${channelId}`);
	}

	highlightChannelClear(): void {
		if (this.highlightChannelId == null) {
			return;
		}
		this.highlightChannelId = null;
		logger.debug('Cleared channel highlight');
	}
}

export default new Autocomplete();

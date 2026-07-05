// SPDX-License-Identifier: AGPL-3.0-or-later

import Emoji from '@app/features/emoji/state/Emoji';
import {Logger} from '@app/features/platform/utils/AppLogger';

const logger = new Logger('Emoji');

function applySkinTonePreference(skinTone: string): void {
	logger.debug(`Setting emoji skin tone: ${skinTone}`);
	Emoji.setSkinTone(skinTone);
}

export function setSkinTone(skinTone: string): void {
	applySkinTonePreference(skinTone);
}

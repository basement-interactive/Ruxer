// SPDX-License-Identifier: AGPL-3.0-or-later

import {GifVideoPoolProvider} from '@app/features/channel/components/GifVideoPool';
import {GifPickerView} from '@app/features/channel/components/pickers/gif/GifPickerView';
import type {Gif} from '@app/features/expressions/commands/GifCommands';

export interface GifPickerProps {
	onClose?: () => void;
	selectGif?: (gif: Gif) => void;
}

export const GifPicker = ({onClose, selectGif}: GifPickerProps = {}) => (
	<GifVideoPoolProvider data-flx="channel.pickers.gif.gif-picker.gif-video-pool-provider">
		<GifPickerView onClose={onClose} selectGif={selectGif} data-flx="channel.pickers.gif.gif-picker.gif-picker-view" />
	</GifVideoPoolProvider>
);

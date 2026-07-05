// SPDX-License-Identifier: AGPL-3.0-or-later

import {GifVideoPoolProvider} from '@app/features/channel/components/GifVideoPool';
import {MemesPickerView} from '@app/features/channel/components/pickers/memes/MemesPickerView';

export interface MemesPickerProps {
	onClose?: () => void;
}

export const MemesPicker = ({onClose}: MemesPickerProps = {}) => (
	<GifVideoPoolProvider data-flx="channel.pickers.memes.memes-picker.gif-video-pool-provider">
		<MemesPickerView onClose={onClose} data-flx="channel.pickers.memes.memes-picker.memes-picker-view" />
	</GifVideoPoolProvider>
);

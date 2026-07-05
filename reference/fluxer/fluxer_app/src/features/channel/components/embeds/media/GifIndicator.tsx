// SPDX-License-Identifier: AGPL-3.0-or-later

import styles from '@app/features/channel/components/embeds/media/GifIndicator.module.css';
import {observer} from 'mobx-react-lite';
import type {FC} from 'react';

export const GifIndicator: FC = observer(() => (
	<div className={styles.indicator} aria-hidden="true" data-flx="channel.embeds.media.gif-indicator.indicator">
		GIF
	</div>
));

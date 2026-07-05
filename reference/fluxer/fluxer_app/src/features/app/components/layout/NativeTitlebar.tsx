// SPDX-License-Identifier: AGPL-3.0-or-later

import styles from '@app/features/app/components/layout/NativeTitlebar.module.css';
import {FluxerWordmark} from '@app/features/ui/components/icons/FluxerWordmark';
import type {NativePlatform} from '@app/features/ui/utils/NativeUtils';
import type React from 'react';
import {NativeWindowControls} from './NativeWindowControls';

interface NativeTitlebarProps {
	platform: NativePlatform;
}

// NOTE (Tauri desktop): WebView2 does NOT honor `-webkit-app-region: drag`
// (that's an Electron patch). Window dragging + double-click-maximize are
// driven by Tauri's built-in `data-tauri-drag-region` handler instead, applied
// to the bar surfaces below. The window controls are separate children without
// the attribute, so their buttons still receive clicks normally.
export const NativeTitlebar: React.FC<NativeTitlebarProps> = ({platform}) => {
	return (
		<div
			role="group"
			className={styles.titlebar}
			data-tauri-drag-region
			data-platform={platform}
			data-native-titlebar=""
			data-flx="app.native-titlebar.titlebar"
		>
			<div className={styles.left} data-tauri-drag-region data-flx="app.native-titlebar.left">
				<FluxerWordmark className={styles.wordmark} data-flx="app.native-titlebar.wordmark" />
			</div>
			<div className={styles.spacer} data-tauri-drag-region data-flx="app.native-titlebar.spacer" />
			<NativeWindowControls data-flx="app.native-titlebar.controls" />
		</div>
	);
};

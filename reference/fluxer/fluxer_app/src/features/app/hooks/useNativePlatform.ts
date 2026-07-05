// SPDX-License-Identifier: AGPL-3.0-or-later

import DeveloperOptions from '@app/features/devtools/state/DeveloperOptions';
import {
	getNativePlatform,
	getNativePlatformSync,
	isDesktop,
	isNativeLinux,
	isNativeMacOS,
	isNativeWindows,
	type NativePlatform,
} from '@app/features/ui/utils/NativeUtils';
import {useEffect, useState} from 'react';

export interface NativePlatformState {
	platform: NativePlatform;
	isNative: boolean;
	isMacOS: boolean;
	isWindows: boolean;
	isLinux: boolean;
}

export const useNativePlatform = (): NativePlatformState => {
	const [platform, setPlatform] = useState<NativePlatform>(getNativePlatformSync);
	const platformOverride = DeveloperOptions.mockTitlebarPlatformOverride;
	const hasOverride = platformOverride !== 'auto';
	const isNative = isDesktop() || hasOverride;
	useEffect(() => {
		if (!isNative) return;
		let cancelled = false;
		void getNativePlatform().then((value) => {
			if (!cancelled && value) {
				setPlatform(value);
			}
		});
		return () => {
			cancelled = true;
		};
	}, [isNative]);
	const effectivePlatform = hasOverride ? platformOverride : platform;
	return {
		platform: effectivePlatform,
		isNative,
		isMacOS: isNative && isNativeMacOS(effectivePlatform),
		isWindows: isNative && isNativeWindows(effectivePlatform),
		isLinux: isNative && isNativeLinux(effectivePlatform),
	};
};

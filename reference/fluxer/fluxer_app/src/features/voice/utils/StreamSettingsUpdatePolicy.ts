// SPDX-License-Identifier: AGPL-3.0-or-later

export type StreamSettingsShareContext = 'app' | 'device' | 'display';

export interface StreamSettingsUpdatePolicyInput {
	platform?: string | null;
	shareContext: StreamSettingsShareContext;
	audioSettingsChanged?: boolean;
}

export function isLinuxDesktopAudioShare(
	input: Pick<StreamSettingsUpdatePolicyInput, 'platform' | 'shareContext'>,
): boolean {
	return input.platform === 'linux' && input.shareContext !== 'device';
}

export function shouldReconfigureLinuxAudioForActiveStreamSettings(input: StreamSettingsUpdatePolicyInput): boolean {
	return isLinuxDesktopAudioShare(input) && input.audioSettingsChanged === true;
}

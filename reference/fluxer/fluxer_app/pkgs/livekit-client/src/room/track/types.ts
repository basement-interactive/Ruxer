// SPDX-FileCopyrightText: 2024 LiveKit, Inc.
//
// SPDX-License-Identifier: Apache-2.0
import type LocalAudioTrack from './LocalAudioTrack.ts';
import type LocalVideoTrack from './LocalVideoTrack.ts';
import type RemoteAudioTrack from './RemoteAudioTrack.ts';
import type RemoteVideoTrack from './RemoteVideoTrack.ts';

export type AudioTrack = RemoteAudioTrack | LocalAudioTrack;
export type VideoTrack = RemoteVideoTrack | LocalVideoTrack;

export type AdaptiveStreamSettings = {
	pixelDensity?: number | 'screen';
	pauseVideoInBackground?: boolean;
};

export interface ReplaceTrackOptions {
	userProvidedTrack?: boolean;
	stopProcessor?: boolean;
}

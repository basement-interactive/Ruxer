// SPDX-FileCopyrightText: 2024 LiveKit, Inc.
//
// SPDX-License-Identifier: Apache-2.0
interface Window {
	documentPictureInPicture?: DocumentPictureInPicture;
}

interface DocumentPictureInPicture extends EventTarget {
	window?: Window;
	requestWindow(options?: {width: number; height: number}): Promise<Window>;
}

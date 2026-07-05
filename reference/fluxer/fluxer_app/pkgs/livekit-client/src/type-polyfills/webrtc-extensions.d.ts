// SPDX-FileCopyrightText: 2024 LiveKit, Inc.
//
// SPDX-License-Identifier: Apache-2.0
interface RTCRtpEncodingParameters {
	scalabilityMode?: string;
}

interface RTCConfiguration {
	encodedInsertableStreams?: boolean;
	sdpSemantics?: string;
	continualGatheringPolicy?: string;
}

interface RTCRtpSender {
	createEncodedStreams?: () => {readable: ReadableStream; writable: WritableStream};
	readableStream?: ReadableStream;
	writableStream?: WritableStream;
}

interface RTCRtpReceiver {
	createEncodedStreams?: () => {readable: ReadableStream; writable: WritableStream};
	readableStream?: ReadableStream;
	writableStream?: WritableStream;
}

type RTCEncodedVideoFrameType = 'delta' | 'empty' | 'key';

interface RTCRtpScriptTransformer {
	readable: ReadableStream;
	writable: WritableStream;
	options?: unknown;
}

interface RTCTransformEvent extends Event {
	transformer: RTCRtpScriptTransformer;
}

interface Window {
	RTCTransformEvent?: unknown;
	onrtctransform?: ((event: RTCTransformEvent) => void) | null;
	webkitAudioContext?: typeof AudioContext;
}

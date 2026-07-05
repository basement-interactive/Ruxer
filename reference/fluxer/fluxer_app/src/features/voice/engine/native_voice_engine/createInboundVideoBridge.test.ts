// @vitest-environment happy-dom
// SPDX-License-Identifier: AGPL-3.0-or-later

import {
	createInboundVideoBridge,
	i420VideoFrameLayout,
	tightI420ByteLength,
} from '@app/features/voice/engine/native_voice_engine/createInboundVideoBridge';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';

class FakeVideoFrame {
	closed = false;
	constructor(
		public readonly data: unknown,
		public readonly init: {format: string; codedWidth: number; codedHeight: number; layout?: unknown},
	) {}
	close(): void {
		this.closed = true;
	}
}

class FakeWriter {
	written: Array<FakeVideoFrame> = [];
	closed = false;
	write(chunk: FakeVideoFrame): Promise<void> {
		this.written.push(chunk);
		return Promise.resolve();
	}
	close(): Promise<void> {
		this.closed = true;
		return Promise.resolve();
	}
}

class FakeGeneratorTrack {
	kind = 'video';
	stopped = false;
	readonly writer = new FakeWriter();
	readonly writable = {getWriter: () => this.writer};
	stop(): void {
		this.stopped = true;
	}
}

class FakeMediaStream {
	constructor(public readonly tracks: Array<unknown>) {}
}

beforeEach(() => {
	Reflect.set(window, 'VideoFrame', FakeVideoFrame);
	Reflect.set(window, 'MediaStreamTrackGenerator', FakeGeneratorTrack);
	Reflect.set(window, 'MediaStream', FakeMediaStream);
});

afterEach(() => {
	Reflect.deleteProperty(window, 'VideoFrame');
	Reflect.deleteProperty(window, 'MediaStreamTrackGenerator');
	Reflect.deleteProperty(window, 'MediaStream');
});

describe('i420VideoFrameLayout', () => {
	it('lays out tightly packed Y/U/V planes', () => {
		const layout = i420VideoFrameLayout(320, 240);
		expect(layout).toEqual([
			{offset: 0, stride: 320},
			{offset: 320 * 240, stride: 160},
			{offset: 320 * 240 + 160 * 120, stride: 160},
		]);
	});
});

describe('tightI420ByteLength', () => {
	it('computes Y + U + V for the dims', () => {
		expect(tightI420ByteLength(320, 240)).toBe(320 * 240 + 2 * 160 * 120);
		expect(tightI420ByteLength(2, 2)).toBe(4 + 2 * 1 * 1);
	});
});

describe('createInboundVideoBridge', () => {
	it('returns null when WebCodecs primitives are unavailable', () => {
		Reflect.deleteProperty(window, 'VideoFrame');
		expect(createInboundVideoBridge('k')).toBeNull();
	});

	it('builds a track + stream and converts a valid I420 frame to a VideoFrame', async () => {
		const bridge = createInboundVideoBridge('PA_1:TR_9');
		expect(bridge).not.toBeNull();
		expect(bridge!.stream).toBeInstanceOf(FakeMediaStream);
		const generator = bridge!.track as unknown as FakeGeneratorTrack;
		bridge!.pushFrame({
			width: 320,
			height: 240,
			timestampUs: 1000,
			data: new ArrayBuffer(tightI420ByteLength(320, 240)),
		});
		await Promise.resolve();
		await Promise.resolve();
		expect(generator.writer.written.length).toBe(1);
		const frame = generator.writer.written[0] as unknown as FakeVideoFrame;
		expect(frame.init.format).toBe('I420');
		expect(frame.init.codedWidth).toBe(320);
		expect(frame.init.codedHeight).toBe(240);
	});

	it('drops frames whose buffer is too small for the dims', async () => {
		const bridge = createInboundVideoBridge('PA_1:TR_9');
		const generator = bridge!.track as unknown as FakeGeneratorTrack;
		bridge!.pushFrame({width: 320, height: 240, timestampUs: 0, data: new ArrayBuffer(10)});
		await Promise.resolve();
		expect(generator.writer.written.length).toBe(0);
	});

	it('drops frames after cleanup', async () => {
		const bridge = createInboundVideoBridge('PA_1:TR_9');
		const generator = bridge!.track as unknown as FakeGeneratorTrack;
		await bridge!.cleanup();
		bridge!.pushFrame({width: 320, height: 240, timestampUs: 0, data: new ArrayBuffer(tightI420ByteLength(320, 240))});
		await Promise.resolve();
		expect(generator.writer.written.length).toBe(0);
		expect(generator.stopped).toBe(true);
	});
});

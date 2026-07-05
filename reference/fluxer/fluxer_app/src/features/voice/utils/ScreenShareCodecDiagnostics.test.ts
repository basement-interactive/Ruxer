// SPDX-License-Identifier: AGPL-3.0-or-later

import {describe, expect, it} from 'vitest';
import {
	findSoftwareVideoDecoder,
	findStalledVideoDecoder,
	isSoftwareVideoImplementation,
} from './ScreenShareCodecDiagnostics';

function createStatsReport(entries: Array<Record<string, unknown>>): RTCStatsReport {
	return new Map(entries.map((entry) => [entry.id as string, entry])) as unknown as RTCStatsReport;
}

describe('isSoftwareVideoImplementation', () => {
	it('detects common software encoder and decoder implementations', () => {
		expect(isSoftwareVideoImplementation('libvpx')).toBe(true);
		expect(isSoftwareVideoImplementation('FFmpegVideoDecoder')).toBe(true);
		expect(isSoftwareVideoImplementation('Dav1dVideoDecoder')).toBe(true);
		expect(isSoftwareVideoImplementation('D3D11VideoDecoder')).toBe(false);
	});
});

describe('findSoftwareVideoDecoder', () => {
	it('finds a software decoder from the decoder implementation', () => {
		const stats = createStatsReport([
			{id: 'codec-1', type: 'codec', mimeType: 'video/AV1'},
			{
				id: 'inbound-1',
				type: 'inbound-rtp',
				kind: 'video',
				codecId: 'codec-1',
				decoderImplementation: 'Dav1dVideoDecoder',
				powerEfficientDecoder: false,
			},
		]);
		expect(findSoftwareVideoDecoder(stats)).toEqual({
			codec: 'AV1',
			implementation: 'Dav1dVideoDecoder',
			powerEfficientDecoder: false,
		});
	});
	it('finds a software decoder from power efficiency when implementation is hidden', () => {
		const stats = createStatsReport([
			{id: 'codec-1', type: 'codec', mimeType: 'video/H264'},
			{
				id: 'inbound-1',
				type: 'inbound-rtp',
				codecId: 'codec-1',
				powerEfficientDecoder: false,
			},
		]);
		expect(findSoftwareVideoDecoder(stats)).toEqual({
			codec: 'H264',
			implementation: 'software decoder',
			powerEfficientDecoder: false,
		});
	});
	it('does not flag a named hardware decoder only because power efficiency is false', () => {
		const stats = createStatsReport([
			{id: 'codec-1', type: 'codec', mimeType: 'video/H264'},
			{
				id: 'inbound-1',
				type: 'inbound-rtp',
				kind: 'video',
				codecId: 'codec-1',
				decoderImplementation: 'VideoToolboxVideoDecoder',
				powerEfficientDecoder: false,
			},
		]);
		expect(findSoftwareVideoDecoder(stats)).toBeNull();
	});
	it('ignores hardware and non-video inbound stats', () => {
		const stats = createStatsReport([
			{id: 'codec-1', type: 'codec', mimeType: 'video/H264'},
			{id: 'codec-2', type: 'codec', mimeType: 'audio/opus'},
			{
				id: 'inbound-1',
				type: 'inbound-rtp',
				kind: 'video',
				codecId: 'codec-1',
				decoderImplementation: 'D3D11VideoDecoder',
				powerEfficientDecoder: true,
			},
			{
				id: 'inbound-2',
				type: 'inbound-rtp',
				kind: 'audio',
				codecId: 'codec-2',
				decoderImplementation: 'FFmpegAudioDecoder',
				powerEfficientDecoder: false,
			},
		]);
		expect(findSoftwareVideoDecoder(stats)).toBeNull();
	});
});

describe('findStalledVideoDecoder', () => {
	it('detects received video packets that never decode into frames', () => {
		const stats = createStatsReport([
			{id: 'codec-1', type: 'codec', mimeType: 'video/VP9'},
			{
				id: 'inbound-1',
				type: 'inbound-rtp',
				kind: 'video',
				codecId: 'codec-1',
				packetsReceived: 42,
				bytesReceived: 32000,
				framesDecoded: 0,
				framesReceived: 8,
			},
		]);
		expect(findStalledVideoDecoder(stats)).toMatchObject({
			codec: 'vp9',
			mimeType: 'video/VP9',
			packetsReceived: 42,
			bytesReceived: 32000,
			framesDecoded: 0,
			framesReceived: 8,
		});
	});
	it('does not treat an idle track as a decoder stall', () => {
		const stats = createStatsReport([
			{id: 'codec-1', type: 'codec', mimeType: 'video/AV1'},
			{
				id: 'inbound-1',
				type: 'inbound-rtp',
				kind: 'video',
				codecId: 'codec-1',
				packetsReceived: 0,
				bytesReceived: 0,
				framesDecoded: 0,
			},
		]);
		expect(findStalledVideoDecoder(stats)).toBeNull();
	});
});

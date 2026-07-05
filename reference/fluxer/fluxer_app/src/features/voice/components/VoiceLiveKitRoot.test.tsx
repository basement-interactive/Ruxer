// @vitest-environment happy-dom
// SPDX-License-Identifier: AGPL-3.0-or-later

import {VoiceLiveKitRoot} from '@app/features/voice/components/VoiceLiveKitRoot';
import {useRoomContext} from '@livekit/components-react';
import {Room} from 'livekit-client';
import {act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';

(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true;

function RoomContextProbe({expectedRoom}: {expectedRoom: Room}) {
	const room = useRoomContext();
	return (
		<div data-testid="room-context" data-flx="voice.voice-live-kit-root-test.room-context-probe.room-context">
			{room === expectedRoom ? 'matched' : 'mismatched'}
		</div>
	);
}

describe('VoiceLiveKitRoot', () => {
	let root: Root | null = null;
	let container: HTMLDivElement | null = null;

	beforeEach(() => {
		container = document.createElement('div');
		document.body.append(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => {
			root?.unmount();
		});
		root = null;
		container?.remove();
		container = null;
	});

	it('provides room context before the audio renderer bundle resolves', async () => {
		const room = new Room();

		act(() => {
			root?.render(
				<VoiceLiveKitRoot room={room} data-flx="voice.voice-live-kit-root-test.voice-live-kit-root">
					<RoomContextProbe expectedRoom={room} data-flx="voice.voice-live-kit-root-test.room-context-probe" />
				</VoiceLiveKitRoot>,
			);
		});

		expect(container?.querySelector('[data-testid="room-context"]')?.textContent).toBe('matched');

		await act(async () => {
			await Promise.resolve();
		});
	});
});

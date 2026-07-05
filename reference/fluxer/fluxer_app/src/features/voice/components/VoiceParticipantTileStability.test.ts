// SPDX-License-Identifier: AGPL-3.0-or-later

import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';

function sourceFile(name: string): string {
	return readFileSync(new URL(name, import.meta.url), 'utf8');
}

function appSourceFile(pathFromAppSrc: string): string {
	return readFileSync(new URL(`../../../${pathFromAppSrc}`, import.meta.url), 'utf8');
}

describe('VoiceParticipantTile stability', () => {
	it('sizes participant avatars on first paint without a resize observer or transform correction pass', () => {
		const tileSource = sourceFile('VoiceParticipantTile.tsx');
		const hookSource = sourceFile('voice_participant_tile/hooks.ts');
		const sharedSource = sourceFile('voice_participant_tile/shared.ts');
		const css = sourceFile('VoiceParticipantTile.module.css');
		expect(tileSource).not.toContain('useAvatarScale');
		expect(hookSource).not.toContain('useAvatarScale');
		expect(hookSource).not.toContain('--tile-avatar-scale');
		expect(sharedSource).not.toContain('resolveAvatarSize');
		expect(tileSource).toContain('styles.tileAvatarRing');
		expect(css).toContain('--tile-avatar-size');
		expect(css).toContain('.tileAvatarRing');
		expect(css).toContain('32cqw');
		expect(css).toContain('32cqh');
		expect(css).not.toContain('--tile-avatar-scale');
		expect(css).not.toMatch(/transform:\s*scale/);
		expect(css).not.toContain('will-change: transform');
	});
	it('keeps the fullscreen call surface mounted while the media room catches up to a channel switch', () => {
		const voiceCallViewSource = sourceFile('VoiceCallView.tsx');
		const guildChannelViewSource = appSourceFile('features/channel/components/channel_view/GuildChannelView.tsx');
		expect(voiceCallViewSource).toContain('const VoiceCallPendingView');
		expect(voiceCallViewSource).toMatch(
			/if \(!hasValidRoomForVoiceCallView\(channel\)\) {\s+return \(\s+<VoiceCallPendingView/,
		);
		expect(voiceCallViewSource).not.toMatch(/if \(!hasValidRoomForVoiceCallView\(channel\)\) {\s+return null;/);
		expect(guildChannelViewSource).not.toContain('{isConnectedToThisChannel && room ? (');
	});
});

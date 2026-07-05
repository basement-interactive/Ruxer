// SPDX-License-Identifier: AGPL-3.0-or-later

import type {PinnableVoiceTrackSource} from '@app/features/voice/engine/VoiceTrackSource';
import {makeAutoObservable} from 'mobx';

export type LayoutMode = 'grid' | 'focus';
export type PinnedParticipantSource = PinnableVoiceTrackSource | null;

class VoiceCallLayout {
	layoutMode: LayoutMode = 'grid';
	pinnedParticipantIdentity: string | null = null;
	pinnedParticipantSource: PinnedParticipantSource = null;
	userOverride = false;
	focusMembersRowVisible = true;

	constructor() {
		makeAutoObservable(this, {}, {autoBind: true});
	}

	getLayoutMode(): LayoutMode {
		return this.layoutMode;
	}

	getPinnedParticipantIdentity(): string | null {
		return this.pinnedParticipantIdentity;
	}

	getPinnedParticipantSource(): PinnedParticipantSource {
		return this.pinnedParticipantSource;
	}

	getFocusMembersRowVisible(): boolean {
		return this.focusMembersRowVisible;
	}

	setLayoutMode(mode: LayoutMode): void {
		this.layoutMode = mode;
	}

	setPinnedParticipant(identity: string | null, source: PinnedParticipantSource = null): void {
		this.pinnedParticipantIdentity = identity;
		this.pinnedParticipantSource = identity ? source : null;
		this.layoutMode = identity ? 'focus' : 'grid';
	}

	setFocusMembersRowVisible(value: boolean): void {
		this.focusMembersRowVisible = value;
	}

	toggleFocusMembersRowVisible(): void {
		this.focusMembersRowVisible = !this.focusMembersRowVisible;
	}

	setUserOverride(value: boolean): void {
		this.userOverride = value;
	}

	markUserOverride(): void {
		this.userOverride = true;
	}

	toggleLayoutMode(): void {
		const newLayoutMode = this.layoutMode === 'grid' ? 'focus' : 'grid';
		this.layoutMode = newLayoutMode;
		if (this.layoutMode === 'grid') {
			this.pinnedParticipantIdentity = null;
			this.pinnedParticipantSource = null;
		}
	}

	clearPinnedParticipant(): void {
		this.pinnedParticipantIdentity = null;
		this.pinnedParticipantSource = null;
		this.layoutMode = 'grid';
	}

	reset(): void {
		this.layoutMode = 'grid';
		this.pinnedParticipantIdentity = null;
		this.pinnedParticipantSource = null;
		this.userOverride = false;
		this.focusMembersRowVisible = true;
	}
}

export default new VoiceCallLayout();

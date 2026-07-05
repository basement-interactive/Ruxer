// SPDX-License-Identifier: AGPL-3.0-or-later

import Drafts from '@app/features/messaging/state/MessagingDrafts';
import type {MentionSegment} from '@app/features/messaging/utils/TextareaSegmentManager';
import {Logger} from '@app/features/platform/utils/AppLogger';

const logger = new Logger('Draft');

type DraftCommand =
	| {kind: 'create'; channelId: string; content: string; segments?: ReadonlyArray<MentionSegment> | null}
	| {kind: 'delete'; channelId: string};

function dispatchDraftCommand(command: DraftCommand): void {
	if (command.kind === 'create') {
		Drafts.createDraft(command.channelId, command.content, command.segments);
		return;
	}
	Drafts.deleteDraft(command.channelId);
}

export function createDraft(channelId: string, content: string, segments?: ReadonlyArray<MentionSegment> | null): void {
	logger.debug(`Creating draft for channel ${channelId}`);
	dispatchDraftCommand({kind: 'create', channelId, content, segments});
}

export function deleteDraft(channelId: string): void {
	logger.debug(`Deleting draft for channel ${channelId}`);
	dispatchDraftCommand({kind: 'delete', channelId});
}

// SPDX-License-Identifier: AGPL-3.0-or-later

import {CompactVoiceCallPlaceholderView} from '@app/features/voice/components/compact_voice_call_view/CompactVoiceCallPlaceholderView';
import {CompactVoiceCallViewInner} from '@app/features/voice/components/compact_voice_call_view/CompactVoiceCallViewInner';
import type {CompactVoiceCallViewProps} from '@app/features/voice/components/compact_voice_call_view/shared';
import {observer} from 'mobx-react-lite';
import type React from 'react';

export const CompactVoiceCallView: React.FC<CompactVoiceCallViewProps> = observer(function CompactVoiceCallView(props) {
	if (props.mediaMode === 'placeholder') {
		return (
			<CompactVoiceCallPlaceholderView
				data-flx="voice.compact-voice-call-view.compact-voice-call-placeholder-view"
				{...props}
			/>
		);
	}
	return (
		<CompactVoiceCallViewInner data-flx="voice.compact-voice-call-view.compact-voice-call-view-inner" {...props} />
	);
});

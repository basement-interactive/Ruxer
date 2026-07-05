// SPDX-License-Identifier: AGPL-3.0-or-later

import {TextareaAutosize} from '@app/features/platform/utils/AutoResizingTextarea';
import StreamerMode from '@app/features/streamer_mode/state/StreamerMode';
import * as UserNoteCommands from '@app/features/user/commands/UserNoteCommands';
import userProfileModalStyles from '@app/features/user/components/modals/UserProfileModal.module.css';
import {
	NOTE_MAX_ROWS,
	NOTE_MIN_ROWS,
	type UserNoteEditorProps,
} from '@app/features/user/components/modals/user_profile_modal/UserProfileModalShared';
import {msg} from '@lingui/core/macro';
import {Trans, useLingui} from '@lingui/react/macro';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useEffect, useRef, useState} from 'react';

const NOTE_DESCRIPTOR = msg({
	message: 'Note',
	comment: 'Short label in the user profile modal. Keep it concise.',
});
const CLICK_TO_ADD_A_NOTE_DESCRIPTOR = msg({
	message: 'Click to add a note',
	comment: 'Label in the user profile modal.',
});
export const UserNoteEditor: React.FC<UserNoteEditorProps> = observer(({userId, initialNote, autoFocus, noteRef}) => {
	const {i18n} = useLingui();
	const [isEditing, setIsEditing] = useState(false);
	const [note, setNote] = useState(initialNote ?? '');
	const internalNoteRef = useRef<HTMLTextAreaElement | null>(null);
	const lastSyncedNoteRef = useRef({userId, note: initialNote ?? ''});
	const textareaRef = noteRef || internalNoteRef;
	useEffect(() => {
		const nextNote = initialNote ?? '';
		const userChanged = lastSyncedNoteRef.current.userId !== userId;
		const noteChanged = lastSyncedNoteRef.current.note !== nextNote;
		if (!userChanged && !noteChanged) return;
		lastSyncedNoteRef.current = {userId, note: nextNote};
		if (userChanged || !isEditing) {
			setNote(nextNote);
		}
	}, [initialNote, isEditing, userId]);
	useEffect(() => {
		if (autoFocus && textareaRef.current) {
			setIsEditing(true);
			const animationFrameId = window.requestAnimationFrame(() => {
				const textarea = textareaRef.current;
				if (!textarea) return;
				textarea.focus();
				const length = textarea.value.length;
				textarea.setSelectionRange(length, length);
			});
			return () => {
				window.cancelAnimationFrame(animationFrameId);
			};
		}
		return undefined;
	}, [autoFocus, textareaRef]);
	const handleBlur = () => {
		if (note !== lastSyncedNoteRef.current.note) {
			UserNoteCommands.update(userId, note);
		}
		setIsEditing(false);
	};
	const handleFocus = () => {
		setIsEditing(true);
		if (textareaRef.current) {
			const length = textareaRef.current.value.length;
			textareaRef.current.setSelectionRange(length, length);
		}
	};
	if (StreamerMode.shouldHidePersonalInformation) {
		return null;
	}
	return (
		<div className={userProfileModalStyles.userNoteEditor} data-flx="user.user-profile-modal.user-note-editor.div">
			<span className={userProfileModalStyles.noteLabel} data-flx="user.user-profile-modal.user-note-editor.span">
				<Trans>Note</Trans>
			</span>
			<TextareaAutosize
				ref={textareaRef}
				aria-label={i18n._(NOTE_DESCRIPTOR)}
				className={clsx(
					userProfileModalStyles.noteTextarea,
					userProfileModalStyles.noteTextareaBase,
					isEditing ? userProfileModalStyles.noteTextareaEditing : userProfileModalStyles.noteTextareaNotEditing,
				)}
				maxLength={256}
				maxRows={NOTE_MAX_ROWS}
				minRows={NOTE_MIN_ROWS}
				onBlur={handleBlur}
				onChange={(event) => setNote(event.target.value)}
				onFocus={handleFocus}
				placeholder={isEditing ? undefined : i18n._(CLICK_TO_ADD_A_NOTE_DESCRIPTOR)}
				value={note}
				data-flx="user.user-profile-modal.user-note-editor.textarea-autosize.set-note"
			/>
		</div>
	);
});

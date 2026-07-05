// SPDX-License-Identifier: AGPL-3.0-or-later

import {type CloudAttachment, CloudUpload, type MessageUpload} from '@app/features/messaging/upload/CloudUpload';
import {useEffect, useState} from 'react';

export function useTextareaAttachments(channelId: string): ReadonlyArray<CloudAttachment> {
	const [attachments, setAttachments] = useState<ReadonlyArray<CloudAttachment>>(() =>
		CloudUpload.getTextareaAttachments(channelId),
	);
	useEffect(() => {
		const subscription = CloudUpload.attachments$(channelId).subscribe((next) => {
			setAttachments((current) => (Object.is(current, next) ? current : next));
		});
		return () => subscription.unsubscribe();
	}, [channelId]);
	return attachments;
}

export function useMessageUpload(nonce: string): MessageUpload | null {
	const [upload, setUpload] = useState<MessageUpload | null>(() =>
		nonce ? CloudUpload.getMessageUpload(nonce) : null,
	);
	useEffect(() => {
		if (!nonce) {
			setUpload((current) => (current === null ? current : null));
			return;
		}
		let frame: number | null = null;
		let pendingUpload: MessageUpload | null | undefined;
		const flushUpload = () => {
			frame = null;
			const next = pendingUpload;
			pendingUpload = undefined;
			if (next === undefined) {
				return;
			}
			setUpload((current) => (Object.is(current, next) ? current : next));
		};
		const setUploadSoon = (next: MessageUpload | null, flush = false) => {
			if (flush || typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
				if (frame != null && typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
					window.cancelAnimationFrame(frame);
					frame = null;
				}
				pendingUpload = undefined;
				setUpload((current) => (Object.is(current, next) ? current : next));
				return;
			}
			pendingUpload = next;
			frame ??= window.requestAnimationFrame(flushUpload);
		};
		setUploadSoon(CloudUpload.getMessageUpload(nonce), true);
		const subscription = CloudUpload.messageUpload$(nonce).subscribe((next) => {
			setUploadSoon(next);
		});
		return () => {
			subscription.unsubscribe();
			if (frame != null && typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
				window.cancelAnimationFrame(frame);
			}
		};
	}, [nonce]);
	return upload;
}

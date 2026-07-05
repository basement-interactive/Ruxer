// SPDX-License-Identifier: AGPL-3.0-or-later

import {useEffect, useState} from 'react';

export function useInviteCountdown(
	expiresAt: string | null | undefined,
	expiredText: string,
): {
	countdown: string | null;
	isMonospace: boolean;
} {
	const [countdown, setCountdown] = useState<string | null>(null);
	const [isMonospace, setIsMonospace] = useState(false);
	useEffect(() => {
		if (!expiresAt) {
			setCountdown(null);
			setIsMonospace(false);
			return;
		}
		const updateTime = () => {
			const expiresAtTime = new Date(expiresAt).getTime();
			const now = Date.now();
			const remaining = expiresAtTime - now;
			if (remaining <= 0) {
				setCountdown(expiredText);
				setIsMonospace(false);
				return;
			}
			const days = Math.floor(remaining / (1000 * 60 * 60 * 24));
			const hours = Math.floor((remaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
			const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
			const seconds = Math.floor((remaining % (1000 * 60)) / 1000);
			const parts: Array<string> = [];
			if (days > 0) {
				parts.push(String(days).padStart(2, '0'));
			}
			parts.push(String(hours).padStart(2, '0'));
			parts.push(String(minutes).padStart(2, '0'));
			parts.push(String(seconds).padStart(2, '0'));
			setCountdown(parts.join(':'));
			setIsMonospace(true);
		};
		updateTime();
		const interval = setInterval(updateTime, 1000);
		return () => clearInterval(interval);
	}, [expiredText, expiresAt]);
	return {countdown, isMonospace};
}

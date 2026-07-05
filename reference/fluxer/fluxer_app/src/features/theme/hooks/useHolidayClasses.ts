// SPDX-License-Identifier: AGPL-3.0-or-later

import {getActiveHolidaySlugs, millisecondsUntilNextLocalMidnight} from '@app/features/theme/utils/HolidayClassUtils';
import {useEffect} from 'react';

const HOLIDAY_CLASS_MARKER = 'data-flx-holiday-class';
const applyHolidayClasses = (root: HTMLElement, slugs: Array<string>) => {
	const previous = root.getAttribute(HOLIDAY_CLASS_MARKER);
	if (previous) {
		for (const slug of previous.split(' ').filter(Boolean)) {
			root.classList.remove(slug);
		}
	}
	for (const slug of slugs) {
		root.classList.add(slug);
	}
	if (slugs.length > 0) {
		root.setAttribute(HOLIDAY_CLASS_MARKER, slugs.join(' '));
		root.setAttribute('data-flx-holidays', slugs.join(' '));
	} else {
		root.removeAttribute(HOLIDAY_CLASS_MARKER);
		root.removeAttribute('data-flx-holidays');
	}
};
export const useHolidayClasses = (): void => {
	useEffect(() => {
		if (typeof document === 'undefined') return;
		const root = document.documentElement;
		let timer: NodeJS.Timeout | null = null;
		let cancelled = false;
		const tick = () => {
			if (cancelled) return;
			const now = new Date();
			applyHolidayClasses(root, getActiveHolidaySlugs(now));
			timer = setTimeout(tick, millisecondsUntilNextLocalMidnight(now));
		};
		tick();
		return () => {
			cancelled = true;
			if (timer != null) clearTimeout(timer);
			applyHolidayClasses(root, []);
		};
	}, []);
};

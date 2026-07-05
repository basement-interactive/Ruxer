// SPDX-License-Identifier: AGPL-3.0-or-later

import MemberList from '@app/features/member/state/MemberList';
import {useEffect, useState} from 'react';

const MIN_WIDTH_FOR_MEMBERS = 1024;

interface UseMemberListVisibleOptions {
	channelId?: string | null;
	defaultHiddenForChannel?: boolean;
}

export const useMemberListVisible = (options: UseMemberListVisibleOptions = {}): boolean => {
	const [canFit, setCanFit] = useState(() => window.innerWidth >= MIN_WIDTH_FOR_MEMBERS);
	useEffect(() => {
		const checkWidth = () => {
			setCanFit(window.innerWidth >= MIN_WIDTH_FOR_MEMBERS);
		};
		window.addEventListener('resize', checkWidth);
		return () => window.removeEventListener('resize', checkWidth);
	}, []);
	return canFit && MemberList.isMembersVisible(options);
};
export const useCanFitMemberList = (): boolean => {
	const [canFit, setCanFit] = useState(() => window.innerWidth >= MIN_WIDTH_FOR_MEMBERS);
	useEffect(() => {
		const checkWidth = () => {
			setCanFit(window.innerWidth >= MIN_WIDTH_FOR_MEMBERS);
		};
		window.addEventListener('resize', checkWidth);
		return () => window.removeEventListener('resize', checkWidth);
	}, []);
	return canFit;
};

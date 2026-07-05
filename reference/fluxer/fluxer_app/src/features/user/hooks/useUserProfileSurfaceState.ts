// SPDX-License-Identifier: AGPL-3.0-or-later

import DeveloperOptions from '@app/features/devtools/state/DeveloperOptions';
import * as UserProfileCommands from '@app/features/user/commands/UserProfileCommands';
import type {Profile} from '@app/features/user/models/Profile';
import UserProfile from '@app/features/user/state/UserProfile';
import {useEffect, useState} from 'react';

interface UseUserProfileSurfaceStateOptions {
	userId: string;
	guildId?: string;
	enabled: boolean;
	fallbackProfile: Profile;
	onError?: (error: unknown) => void;
}

interface UserProfileSurfaceState {
	profile: Profile | null;
	profileLoadError: boolean;
	isProfileLoading: boolean;
	showProfileSkeleton: boolean;
}

const PROFILE_LOAD_DELAY_MS = 3000;

export function useUserProfileSurfaceState({
	userId,
	guildId,
	enabled,
	fallbackProfile,
	onError,
}: UseUserProfileSurfaceStateOptions): UserProfileSurfaceState {
	const [profile, setProfile] = useState<Profile | null>(() => {
		if (!enabled) {
			return fallbackProfile;
		}
		return UserProfile.getProfile(userId, guildId);
	});
	const [profileLoadError, setProfileLoadError] = useState(false);
	const [isProfileLoading, setIsProfileLoading] = useState(() => enabled && !UserProfile.getProfile(userId, guildId));

	useEffect(() => {
		let cancelled = false;
		if (!enabled) {
			setProfile(fallbackProfile);
			setProfileLoadError(false);
			setIsProfileLoading(false);
			return () => {
				cancelled = true;
			};
		}
		const cachedProfile = UserProfile.getProfile(userId, guildId);
		if (cachedProfile) {
			setProfile(cachedProfile);
			setProfileLoadError(false);
			setIsProfileLoading(false);
			return () => {
				cancelled = true;
			};
		}
		setProfile(null);
		setProfileLoadError(false);
		setIsProfileLoading(true);
		const fetchProfile = async () => {
			try {
				if (DeveloperOptions.slowProfileLoad) {
					await new Promise((resolve) => setTimeout(resolve, PROFILE_LOAD_DELAY_MS));
				}
				if (cancelled) {
					return;
				}
				const fetchedProfile = await UserProfileCommands.fetch(userId, guildId);
				if (cancelled) {
					return;
				}
				setProfile(fetchedProfile);
				setProfileLoadError(false);
			} catch (error) {
				if (cancelled) {
					return;
				}
				onError?.(error);
				setProfile(UserProfile.getProfile(userId, guildId) ?? fallbackProfile);
				setProfileLoadError(true);
			} finally {
				if (!cancelled) {
					setIsProfileLoading(false);
				}
			}
		};
		void fetchProfile();
		return () => {
			cancelled = true;
		};
	}, [enabled, fallbackProfile, guildId, onError, userId]);

	return {
		profile,
		profileLoadError,
		isProfileLoading,
		showProfileSkeleton: DeveloperOptions.forceProfileSkeletons || (enabled && isProfileLoading && !profile),
	};
}

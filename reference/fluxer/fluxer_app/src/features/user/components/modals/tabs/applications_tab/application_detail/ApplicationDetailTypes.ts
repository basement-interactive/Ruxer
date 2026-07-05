// SPDX-License-Identifier: AGPL-3.0-or-later

import type {UseFormReturn} from 'react-hook-form';

export interface ApplicationDetailFormValues {
	name: string;
	redirectUris: Array<string>;
	botPublic: boolean;
	botRequireCodeGrant: boolean;
	friendlyBot: boolean;
	botManualFriendRequestApproval: boolean;
	username?: string;
	avatar?: string | null;
	bio?: string | null;
	banner?: string | null;
	redirectUriInputs: Array<string>;
	builderScopes: Record<string, boolean>;
	builderRedirectUri?: string;
	builderPermissions: Record<string, boolean>;
}

export type ApplicationDetailForm = UseFormReturn<ApplicationDetailFormValues>;

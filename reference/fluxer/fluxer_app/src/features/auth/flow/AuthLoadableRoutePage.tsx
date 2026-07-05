// SPDX-License-Identifier: AGPL-3.0-or-later

import {AuthLoadingState} from '@app/features/auth/flow/AuthLoadingState';
import {AuthRouteLoadError} from '@app/features/auth/flow/AuthRouteLoadError';
import {
	createDefaultLoadableComponent,
	createNamedLoadableComponent,
	type LoadableComponent,
} from '@app/features/platform/components/loadable/LoadableComponent';

export type AuthRoutePageProps = Record<string, unknown>;
export type AuthRoutePage = LoadableComponent<AuthRoutePageProps>;

export function createAuthRoutePage(displayName: string, load: () => Promise<{default: unknown}>): AuthRoutePage {
	return createDefaultLoadableComponent<AuthRoutePageProps>({
		displayName,
		LoadingComponent: AuthLoadingState,
		ErrorComponent: AuthRouteLoadError,
		load,
	});
}

export function createNamedAuthRoutePage(displayName: string, load: () => Promise<unknown>): AuthRoutePage {
	return createNamedLoadableComponent<AuthRoutePageProps>({
		displayName,
		LoadingComponent: AuthLoadingState,
		ErrorComponent: AuthRouteLoadError,
		load,
	});
}

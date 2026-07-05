// SPDX-License-Identifier: AGPL-3.0-or-later

import {loadLazyModule} from '@app/features/platform/utils/LazyModuleLoader';
import {type ComponentType, useCallback, useEffect, useReducer} from 'react';

export interface LoadableErrorProps {
	error: unknown;
	retry: () => void;
}

export interface LoadableModule<Props extends object> {
	default: ComponentType<Props>;
}

export type LoadableComponent<Props extends object> = ComponentType<Props> & {
	preload: () => Promise<void>;
};

export interface CreateLoadableComponentOptions<Props extends object> {
	displayName: string;
	load: () => Promise<LoadableModule<Props>>;
	LoadingComponent?: ComponentType;
	ErrorComponent?: ComponentType<LoadableErrorProps>;
}

interface CreateDefaultLoadableComponentOptions<Props extends object>
	extends Omit<CreateLoadableComponentOptions<Props>, 'load'> {
	load: () => Promise<{default: unknown}>;
}

interface CreateNamedLoadableComponentOptions<Props extends object>
	extends Omit<CreateLoadableComponentOptions<Props>, 'load'> {
	load: () => Promise<unknown>;
}

type LoadState<Props extends object> =
	| {
			status: 'idle' | 'loading';
	  }
	| {
			status: 'loaded';
			Component: ComponentType<Props>;
	  }
	| {
			status: 'error';
			error: unknown;
	  };

function NullLoadingComponent(): null {
	return null;
}

function NullErrorComponent(_props: LoadableErrorProps): null {
	return null;
}

export function createLoadableComponent<Props extends object>({
	displayName,
	load,
	LoadingComponent = NullLoadingComponent,
	ErrorComponent = NullErrorComponent,
}: CreateLoadableComponentOptions<Props>): LoadableComponent<Props> {
	let state: LoadState<Props> = {status: 'idle'};
	let loadPromise: Promise<ComponentType<Props>> | null = null;

	const loadOnce = async (): Promise<ComponentType<Props>> => {
		if (state.status === 'loaded') {
			return state.Component;
		}
		if (loadPromise) {
			return loadPromise;
		}
		state = {status: 'loading'};
		loadPromise = loadLazyModule(load)
			.then((module) => {
				state = {
					status: 'loaded',
					Component: module.default,
				};
				return module.default;
			})
			.catch((error: unknown) => {
				state = {
					status: 'error',
					error,
				};
				throw error;
			})
			.finally(() => {
				loadPromise = null;
			});
		return loadPromise;
	};

	const preload = async () => {
		if (state.status === 'error') {
			state = {status: 'idle'};
		}
		await loadOnce();
	};

	const Loadable = (props: Props) => {
		const [, forceRender] = useReducer((version: number) => version + 1, 0);
		useEffect(() => {
			if (state.status === 'loaded' || state.status === 'error') {
				return;
			}
			let cancelled = false;
			void loadOnce().then(
				() => {
					if (!cancelled) forceRender();
				},
				() => {
					if (!cancelled) forceRender();
				},
			);
			return () => {
				cancelled = true;
			};
		}, []);
		const retry = useCallback(() => {
			if (state.status === 'error') {
				state = {status: 'idle'};
			}
			forceRender();
			void loadOnce().then(
				() => forceRender(),
				() => forceRender(),
			);
		}, []);
		if (state.status === 'loaded') {
			const LoadedComponent = state.Component;
			return <LoadedComponent data-flx="platform.loadable.loadable-component.loaded-component" {...props} />;
		}
		if (state.status === 'error') {
			return (
				<ErrorComponent
					error={state.error}
					retry={retry}
					data-flx="platform.loadable.loadable-component.error-component"
				/>
			);
		}
		return <LoadingComponent data-flx="platform.loadable.loadable-component.loading-component" />;
	};

	Loadable.displayName = displayName;
	return Object.assign(Loadable, {preload});
}

export function createDefaultLoadableComponent<Props extends object>({
	load,
	...options
}: CreateDefaultLoadableComponentOptions<Props>): LoadableComponent<Props> {
	return createLoadableComponent<Props>({
		...options,
		load: async () => {
			const module = await load();
			return {default: module.default as ComponentType<Props>};
		},
	});
}

export function createNamedLoadableComponent<Props extends object>({
	load,
	...options
}: CreateNamedLoadableComponentOptions<Props>): LoadableComponent<Props> {
	return createLoadableComponent<Props>({
		...options,
		load: async () => ({default: (await load()) as ComponentType<Props>}),
	});
}

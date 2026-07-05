// SPDX-License-Identifier: AGPL-3.0-or-later

import Toast from '@app/features/ui/state/Toast';
import type {ToastProps} from '@app/features/ui/toast';

type ToastIntent =
	| {kind: 'create'; data: ToastProps}
	| {kind: 'destroy'; id: string}
	| {kind: 'success'; message: string}
	| {kind: 'error'; message: string};

function dispatchToastIntent(intent: ToastIntent): string | undefined {
	switch (intent.kind) {
		case 'create':
			return Toast.createToast(intent.data);
		case 'destroy':
			Toast.destroyToast(intent.id);
			return;
		case 'success':
			return Toast.success(intent.message);
		case 'error':
			return Toast.error(intent.message);
	}
}

export function createToast(data: ToastProps): string {
	return dispatchToastIntent({kind: 'create', data}) as string;
}

export function destroyToast(id: string): void {
	dispatchToastIntent({kind: 'destroy', id});
}

export function success(message: string): string {
	return dispatchToastIntent({kind: 'success', message}) as string;
}

export function error(message: string): string {
	return dispatchToastIntent({kind: 'error', message}) as string;
}

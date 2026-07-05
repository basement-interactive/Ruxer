// SPDX-License-Identifier: AGPL-3.0-or-later

import {
	checkNativePermission,
	type NativePermissionResult,
	type PermissionKind,
} from '@app/features/permissions/system/utils/NativePermissions';
import {Logger} from '@app/features/platform/utils/AppLogger';
import {makePersistent} from '@app/features/platform/utils/MobXPersistence';
import {getNativePlatformSync, isDesktop} from '@app/features/ui/utils/NativeUtils';
import {makeAutoObservable, runInAction} from 'mobx';

export type MacPermissionKind = Extract<PermissionKind, 'microphone' | 'camera' | 'screen' | 'input-monitoring'>;
export type MacPermissionDecision = 'granted-seen' | 'declined' | null;

const logger = new Logger('MacPermissions');

export const MAC_PERMISSION_KINDS: ReadonlyArray<MacPermissionKind> = [
	'microphone',
	'camera',
	'screen',
	'input-monitoring',
];

const DEFAULT_STATUSES: Record<MacPermissionKind, NativePermissionResult> = {
	microphone: 'not-determined',
	camera: 'not-determined',
	screen: 'not-determined',
	'input-monitoring': 'not-determined',
};

const DEFAULT_DECISIONS: Record<MacPermissionKind, MacPermissionDecision> = {
	microphone: null,
	camera: null,
	screen: null,
	'input-monitoring': null,
};

class MacPermissions {
	statuses: Record<MacPermissionKind, NativePermissionResult> = {...DEFAULT_STATUSES};
	decisions: Record<MacPermissionKind, MacPermissionDecision> = {...DEFAULT_DECISIONS};
	setupCompleted = false;
	restartRequired: Record<MacPermissionKind, boolean> = {
		microphone: false,
		camera: false,
		screen: false,
		'input-monitoring': false,
	};
	isHydrated = false;
	onboardingOpenedThisSession = false;

	constructor() {
		makeAutoObservable(this, {}, {autoBind: true});
		void this.initialize();
	}

	private async initialize(): Promise<void> {
		await makePersistent(this, 'MacPermissions', ['decisions', 'setupCompleted'], {version: 1});
		await this.refreshAll();
		runInAction(() => {
			this.isHydrated = true;
		});
	}

	get isNativeMacDesktop(): boolean {
		return isDesktop() && getNativePlatformSync() === 'macos';
	}

	get shouldShowOnboarding(): boolean {
		return this.isNativeMacDesktop && this.isHydrated && !this.setupCompleted;
	}

	hasDeclined(kind: MacPermissionKind): boolean {
		return this.decisions[kind] === 'declined';
	}

	markOnboardingOpenedThisSession(): void {
		this.onboardingOpenedThisSession = true;
	}

	private recordStatus(kind: MacPermissionKind, status: NativePermissionResult): void {
		const previous = this.statuses[kind];
		this.statuses[kind] = status;
		if (!this.isHydrated) return;
		if (status === 'granted' && previous !== 'granted' && this.restartApplies(kind)) {
			this.restartRequired[kind] = true;
		}
	}

	private restartApplies(kind: MacPermissionKind): boolean {
		return kind === 'screen' || kind === 'input-monitoring';
	}

	private decisionFromStatus(status: NativePermissionResult): MacPermissionDecision {
		return status === 'granted' ? 'granted-seen' : 'declined';
	}

	private completeSetupIfFullyGranted(): void {
		const fullyGranted = MAC_PERMISSION_KINDS.every((kind) => this.statuses[kind] === 'granted');
		if (!fullyGranted) return;
		this.setupCompleted = true;
		for (const kind of MAC_PERMISSION_KINDS) {
			this.decisions[kind] = 'granted-seen';
		}
	}

	async refreshAll(): Promise<void> {
		if (!this.isNativeMacDesktop) {
			runInAction(() => {
				for (const kind of MAC_PERMISSION_KINDS) {
					this.statuses[kind] = 'unsupported';
				}
			});
			return;
		}
		try {
			const entries = await Promise.all(
				MAC_PERMISSION_KINDS.map(async (kind) => [kind, await checkNativePermission(kind)] as const),
			);
			runInAction(() => {
				for (const [kind, status] of entries) {
					this.recordStatus(kind, status);
				}
				this.completeSetupIfFullyGranted();
			});
		} catch (error) {
			logger.warn('Failed to refresh macOS permissions', error);
		}
	}

	async refreshKind(kind: MacPermissionKind): Promise<NativePermissionResult> {
		if (!this.isNativeMacDesktop) return 'unsupported';
		const status = await checkNativePermission(kind);
		runInAction(() => {
			this.recordStatus(kind, status);
			this.completeSetupIfFullyGranted();
		});
		return status;
	}

	applyPermissionResult(kind: MacPermissionKind, status: NativePermissionResult): void {
		this.recordStatus(kind, status);
		if (status === 'granted') {
			this.decisions[kind] = 'granted-seen';
		}
		this.completeSetupIfFullyGranted();
	}

	recordModalClosed(focus?: MacPermissionKind): void {
		if (focus) {
			this.decisions[focus] = this.decisionFromStatus(this.statuses[focus]);
			return;
		}
		this.setupCompleted = true;
		for (const kind of MAC_PERMISSION_KINDS) {
			this.decisions[kind] = this.decisionFromStatus(this.statuses[kind]);
		}
	}
}

export default new MacPermissions();

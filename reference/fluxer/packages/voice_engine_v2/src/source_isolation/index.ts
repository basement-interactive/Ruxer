// SPDX-License-Identifier: AGPL-3.0-or-later

export {
	MAX_TRACKED_SOURCES,
	type SourceLifecycleDispatchResult,
	SourceLifecycleRegistry,
	type SourceLifecycleSnapshotEntry,
} from './SourceLifecycleRegistry';
export {
	computeReconnectBackoffMs,
	createInitialActiveState,
	MAX_RECONNECT_ATTEMPTS,
	RECONNECT_BACKOFF_CAP_MS,
	RECONNECT_BACKOFF_STEP_MS,
	type SourceFault,
	type SourceLifecycleAction,
	type SourceLifecycleClock,
	SourceLifecycleError,
	type SourceLifecycleEvent,
	type SourceLifecycleState,
	type SourceLifecycleTransitionResult,
	transitionSourceLifecycle,
} from './SourceLifecycleState';

// SPDX-License-Identifier: AGPL-3.0-or-later

import type {DesktopHandoffInfoResponse} from '@app/features/auth/commands/AuthenticationCommands';
import * as AuthenticationCommands from '@app/features/auth/commands/AuthenticationCommands';
import * as FormUtils from '@app/lib/forms';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {useCallback, useMemo, useRef, useState} from 'react';

const INVALID_OR_EXPIRED_CODE_PLEASE_TRY_AGAIN_DESCRIPTOR = msg({
	message: 'Invalid or expired code. Try again.',
	comment: 'Desktop handoff flow error shown when the entered pairing code is invalid or expired.',
});
const COULDN_T_VERIFY_THAT_CODE_PLEASE_TRY_AGAIN_DESCRIPTOR = msg({
	message: "Couldn't verify that code. Try again.",
	comment: 'Desktop handoff flow error shown when verifying the pairing code fails for an unexpected reason.',
});
const COULDN_T_COMPLETE_SIGN_IN_PLEASE_TRY_AGAIN_DESCRIPTOR = msg({
	message: "Couldn't complete sign-in. Try again.",
	comment: 'Desktop handoff flow error shown when finalizing the sign-in fails after a valid code.',
});

export type DesktopHandoffMode =
	| 'idle'
	| 'selecting'
	| 'login'
	| 'warning'
	| 'code_input'
	| 'fetching_info'
	| 'approving'
	| 'completing'
	| 'done'
	| 'error';

const APPROVAL_FLOW_MODES: ReadonlySet<DesktopHandoffMode> = new Set([
	'warning',
	'code_input',
	'fetching_info',
	'approving',
	'completing',
	'done',
	'error',
]);

export function isApprovalFlowMode(mode: DesktopHandoffMode): boolean {
	return APPROVAL_FLOW_MODES.has(mode);
}

export function isHandoffRequest(params: URLSearchParams): boolean {
	return params.get('handoff') === '1' || params.get('desktop_handoff') === '1';
}

interface Options {
	enabled: boolean;
	hasStoredAccounts: boolean;
	initialMode?: DesktopHandoffMode;
}

export function useDesktopHandoffFlow({enabled, hasStoredAccounts, initialMode}: Options) {
	const {i18n} = useLingui();
	const derivedInitial = useMemo<DesktopHandoffMode>(() => {
		if (!enabled) return 'idle';
		if (initialMode) return initialMode;
		return hasStoredAccounts ? 'selecting' : 'login';
	}, [enabled, hasStoredAccounts, initialMode]);
	const [mode, setMode] = useState<DesktopHandoffMode>(derivedInitial);
	const [error, setError] = useState<string | null>(null);
	const [clientInfo, setClientInfo] = useState<DesktopHandoffInfoResponse['client_info']>(null);
	const [handoffCode, setHandoffCode] = useState<string | null>(null);
	const tokenRef = useRef<string | null>(null);
	const userIdRef = useRef<string | null>(null);
	const start = useCallback(
		({token, userId}: {token: string; userId: string}) => {
			if (!enabled) return;
			tokenRef.current = token;
			userIdRef.current = userId;
			setError(null);
			setHandoffCode(null);
			setClientInfo(null);
			setMode('warning');
		},
		[enabled],
	);
	const proceedToCodeInput = useCallback(() => {
		setMode('code_input');
		setError(null);
	}, []);
	const submitCode = useCallback(
		async (code: string) => {
			setMode('fetching_info');
			setError(null);
			setHandoffCode(code);
			try {
				const info = await AuthenticationCommands.fetchDesktopHandoffInfo(code);
				if (info.status === 'expired') {
					setMode('error');
					setError(i18n._(INVALID_OR_EXPIRED_CODE_PLEASE_TRY_AGAIN_DESCRIPTOR));
					return;
				}
				setClientInfo(info.client_info);
				setMode('approving');
			} catch (e) {
				setMode('error');
				setError(
					e && typeof e === 'object' && 'body' in e
						? FormUtils.extractErrorMessage(i18n, e)
						: i18n._(COULDN_T_VERIFY_THAT_CODE_PLEASE_TRY_AGAIN_DESCRIPTOR),
				);
			}
		},
		[i18n],
	);
	const approve = useCallback(async () => {
		if (!handoffCode || !tokenRef.current || !userIdRef.current) return;
		setMode('completing');
		setError(null);
		try {
			await AuthenticationCommands.completeDesktopHandoff({
				code: handoffCode,
				token: tokenRef.current,
				userId: userIdRef.current,
			});
			setMode('done');
		} catch (e) {
			setMode('error');
			setError(
				e && typeof e === 'object' && 'body' in e
					? FormUtils.extractErrorMessage(i18n, e)
					: i18n._(COULDN_T_COMPLETE_SIGN_IN_PLEASE_TRY_AGAIN_DESCRIPTOR),
			);
		}
	}, [handoffCode, i18n]);
	const deny = useCallback(() => {
		setHandoffCode(null);
		setClientInfo(null);
		setMode('code_input');
	}, []);
	const switchToLogin = useCallback(() => {
		setMode('login');
		setError(null);
	}, []);
	const retry = useCallback(() => {
		setError(null);
		setHandoffCode(null);
		setClientInfo(null);
		tokenRef.current = null;
		userIdRef.current = null;
		setMode(hasStoredAccounts ? 'selecting' : 'login');
	}, [hasStoredAccounts]);
	return {
		mode,
		error,
		clientInfo,
		handoffCode,
		setMode,
		start,
		proceedToCodeInput,
		submitCode,
		approve,
		deny,
		switchToLogin,
		retry,
	};
}

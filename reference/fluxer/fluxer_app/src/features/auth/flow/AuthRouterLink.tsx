// SPDX-License-Identifier: AGPL-3.0-or-later

import {Link as RouterLink} from '@app/features/platform/components/router/RouterReact';
import FocusRing from '@app/features/ui/focus_ring/FocusRing';
import type {ReactNode} from 'react';

interface AuthRouterLinkProps {
	ringOffset?: number;
	children?: ReactNode;
	className?: string;
	to: string;
	search?: Record<string, string>;
}

export function AuthRouterLink({ringOffset = -2, children, className, to, search}: AuthRouterLinkProps) {
	return (
		<FocusRing offset={ringOffset} data-flx="auth.flow.auth-router-link.focus-ring">
			<RouterLink
				tabIndex={0}
				className={className}
				to={to}
				search={search}
				data-flx="auth.flow.auth-router-link.router-link"
			>
				{children}
			</RouterLink>
		</FocusRing>
	);
}

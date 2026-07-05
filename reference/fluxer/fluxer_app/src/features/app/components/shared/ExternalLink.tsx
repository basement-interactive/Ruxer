// SPDX-License-Identifier: AGPL-3.0-or-later

import styles from '@app/features/app/components/shared/ExternalLink.module.css';
import {openOAuthAuthorizeModalFromUrl} from '@app/features/auth/commands/OAuthAuthorizeModalCommands';
import FocusRing from '@app/features/ui/focus_ring/FocusRing';
import {openExternalUrl} from '@app/features/ui/utils/NativeUtils';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import type {AnchorHTMLAttributes, FC, MouseEventHandler} from 'react';
import {useRef} from 'react';

type ExternalLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
	href: string;
	children: React.ReactNode;
};

export const ExternalLink: FC<ExternalLinkProps> = observer(({href, children, className, ...props}) => {
	const linkRef = useRef<HTMLAnchorElement>(null);
	const handleClick: MouseEventHandler<HTMLAnchorElement> = async (event) => {
		if (event.button !== 0) return;
		event.preventDefault();
		event.stopPropagation();
		if (openOAuthAuthorizeModalFromUrl(href)) return;
		await openExternalUrl(href);
	};
	const handleAuxClick: MouseEventHandler<HTMLAnchorElement> = async (event) => {
		if (event.button !== 1) return;
		event.preventDefault();
		event.stopPropagation();
		await openExternalUrl(href);
	};
	return (
		<FocusRing ringTarget={linkRef} data-flx="app.external-link.focus-ring">
			<a
				ref={linkRef}
				href={href}
				target="_blank"
				rel="noopener noreferrer"
				className={clsx(styles.externalLink, className)}
				onClick={handleClick}
				onAuxClick={handleAuxClick}
				data-flx="app.external-link.external-link.click"
				{...props}
			>
				{children}
			</a>
		</FocusRing>
	);
});

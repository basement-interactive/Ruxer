// SPDX-License-Identifier: AGPL-3.0-or-later

import * as ToastCommands from '@app/features/ui/commands/ToastCommands';
import {usePortalHost} from '@app/features/ui/overlay/PortalHostContext';
import ToastState from '@app/features/ui/state/Toast';
import {Toast} from '@app/features/ui/toast/Toast';
import styles from '@app/features/ui/toast/Toasts.module.css';
import {isMobileExperienceEnabled} from '@app/features/ui/utils/MobileExperience';
import {clsx} from 'clsx';
import {AnimatePresence} from 'framer-motion';
import {observer} from 'mobx-react-lite';
import {useCallback, useEffect, useState} from 'react';
import {createPortal} from 'react-dom';

export const Toasts: React.FC = observer(() => {
	const [bodyPortalRoot, setBodyPortalRoot] = useState<HTMLElement | null>(null);
	const overrideHost = usePortalHost();
	useEffect(() => {
		const container = document.createElement('div');
		container.id = 'toast-portal-root';
		document.body.appendChild(container);
		setBodyPortalRoot(container);
		return () => {
			document.body.removeChild(container);
		};
	}, []);
	const isMobileExperience = isMobileExperienceEnabled();
	const closeToast = useCallback((id: string) => {
		ToastCommands.destroyToast(id);
	}, []);
	const portalRoot = overrideHost ?? bodyPortalRoot;
	if (!portalRoot) return null;
	return createPortal(
		<div
			className={clsx(styles.container, isMobileExperience ? styles.containerMobile : styles.containerDesktop)}
			data-flx="ui.toast.toasts.container"
		>
			<AnimatePresence mode="wait" data-flx="ui.toast.toasts.animate-presence">
				{ToastState.currentToast && (
					<div
						key={ToastState.currentToast.id}
						className={styles.toastWrapper}
						data-flx="ui.toast.toasts.toast-wrapper"
					>
						<Toast
							id={ToastState.currentToast.id}
							closeToast={closeToast}
							data-flx="ui.toast.toasts.toast"
							{...ToastState.currentToast.data}
						/>
					</div>
				)}
			</AnimatePresence>
		</div>,
		portalRoot,
	);
});

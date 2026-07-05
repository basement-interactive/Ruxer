// SPDX-License-Identifier: AGPL-3.0-or-later

import {LongPressable} from '@app/features/app/components/LongPressable';
import styles from '@app/features/app/components/layout/GuildHeader.module.css';
import {useMergeRefs} from '@app/features/app/hooks/useMergeRefs';
import {isKeyboardActivationKey} from '@app/features/input/utils/KeyboardUtils';
import FocusRing from '@app/features/ui/focus_ring/FocusRing';
import {Popout} from '@app/features/ui/popover/PopoverPopout';
import PopoutState from '@app/features/ui/state/Popout';
import {isMobileExperienceEnabled} from '@app/features/ui/utils/MobileExperience';
import {observer} from 'mobx-react-lite';
import React, {useCallback, useRef, useState} from 'react';

interface GuildHeaderShellProps {
	popoutId: string;
	renderPopout: () => React.ReactNode;
	renderBottomSheet: (props: {isOpen: boolean; onClose: () => void}) => React.ReactNode;
	onContextMenu: (event: React.MouseEvent) => void;
	children: React.ReactNode | ((isOpen: boolean) => React.ReactNode);
	className?: string;
	triggerRef?: React.Ref<HTMLDivElement>;
	ariaLabel: string;
}

const GuildHeaderTrigger = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
	(props, forwardedRef) => {
		const {children, ...rest} = props;
		const triggerRef = useRef<HTMLDivElement | null>(null);
		const mergedRef = useMergeRefs([triggerRef, forwardedRef]);
		return (
			<FocusRing
				ringClassName={styles.headerFocusRing}
				focusTarget={triggerRef}
				ringTarget={triggerRef}
				offset={0}
				data-flx="app.guild-header-shell.guild-header-trigger.focus-ring"
			>
				<div data-flx="app.guild-header-shell.guild-header-trigger.div" {...rest} ref={mergedRef}>
					{children}
				</div>
			</FocusRing>
		);
	},
);

GuildHeaderTrigger.displayName = 'GuildHeaderTrigger';

export const GuildHeaderShell = observer(
	({
		popoutId,
		renderPopout,
		renderBottomSheet,
		onContextMenu,
		children,
		className,
		triggerRef,
		ariaLabel,
	}: GuildHeaderShellProps) => {
		const {popouts} = PopoutState;
		const isOpen = popoutId in popouts;
		const [bottomSheetOpen, setBottomSheetOpen] = useState(false);
		const isMobile = isMobileExperienceEnabled();
		const internalRef = useRef<HTMLDivElement | null>(null);
		const mergedRef = useMergeRefs([internalRef, triggerRef]);
		const handleOpenBottomSheet = useCallback(() => {
			setBottomSheetOpen(true);
		}, []);
		const handleCloseBottomSheet = useCallback(() => {
			setBottomSheetOpen(false);
		}, []);
		const handleContextMenuWrapper = useCallback(
			(event: React.MouseEvent) => {
				event.preventDefault();
				event.stopPropagation();
				if (isMobile) {
					handleOpenBottomSheet();
				} else {
					onContextMenu(event);
				}
			},
			[isMobile, handleOpenBottomSheet, onContextMenu],
		);
		if (isMobile) {
			return (
				<>
					<FocusRing
						ringClassName={styles.headerFocusRing}
						focusTarget={internalRef}
						ringTarget={internalRef}
						offset={0}
						data-flx="app.guild-header-shell.focus-ring"
					>
						<LongPressable
							className={className}
							onClick={handleOpenBottomSheet}
							onKeyDown={(e) => {
								if (isKeyboardActivationKey(e.key)) {
									e.preventDefault();
									handleOpenBottomSheet();
								}
							}}
							onContextMenu={handleContextMenuWrapper}
							onLongPress={handleOpenBottomSheet}
							role="button"
							aria-label={ariaLabel}
							aria-haspopup="dialog"
							aria-expanded={bottomSheetOpen}
							tabIndex={0}
							ref={mergedRef}
							data-flx="app.guild-header-shell.button.open-bottom-sheet"
						>
							{typeof children === 'function' ? children(bottomSheetOpen) : children}
						</LongPressable>
					</FocusRing>
					{renderBottomSheet({isOpen: bottomSheetOpen, onClose: handleCloseBottomSheet})}
				</>
			);
		}
		return (
			<Popout uniqueId={popoutId} render={renderPopout} position="bottom" data-flx="app.guild-header-shell.popout">
				<GuildHeaderTrigger
					className={className}
					onContextMenu={handleContextMenuWrapper}
					role="button"
					aria-label={ariaLabel}
					aria-haspopup="menu"
					aria-expanded={isOpen}
					tabIndex={0}
					ref={mergedRef}
					data-flx="app.guild-header-shell.button.context-menu-wrapper"
				>
					{typeof children === 'function' ? children(isOpen) : children}
				</GuildHeaderTrigger>
			</Popout>
		);
	},
);

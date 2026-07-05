// SPDX-License-Identifier: AGPL-3.0-or-later

import * as Sheet from '@app/features/ui/sheet/Sheet';
import {observer} from 'mobx-react-lite';
import type React from 'react';

interface BottomSheetProps {
	isOpen: boolean;
	onClose: () => void;
	children: React.ReactNode;
	title?: string;
	initialSnap?: number;
	snapPoints?: Array<number>;
	disablePadding?: boolean;
	disableDefaultHeader?: boolean;
	zIndex?: number;
	showHandle?: boolean;
	showCloseButton?: boolean;
	surface?: 'primary' | 'secondary' | 'tertiary';
	headerSlot?: React.ReactNode;
	leadingAction?: React.ReactNode;
	trailingAction?: React.ReactNode;
	containerClassName?: string;
	contentClassName?: string;
}

export const BottomSheet: React.FC<BottomSheetProps> = observer(
	({
		isOpen,
		onClose,
		children,
		title,
		initialSnap = 1,
		snapPoints = [0, 0.5, 0.8, 1],
		disablePadding = false,
		disableDefaultHeader = false,
		zIndex,
		showHandle = true,
		showCloseButton = true,
		surface = 'secondary',
		headerSlot,
		leadingAction,
		trailingAction,
		containerClassName,
		contentClassName,
	}) => {
		const shouldRenderDefaultHeader =
			!disableDefaultHeader && (!!title || !!leadingAction || !!trailingAction || showCloseButton);
		const renderTrailingContent = () => {
			if (!shouldRenderDefaultHeader) return undefined;
			if (trailingAction && showCloseButton) {
				return (
					<>
						{trailingAction}
						<Sheet.CloseButton
							onClick={onClose}
							data-flx="ui.bottom-sheet.bottom-sheet.render-trailing-content.sheet-close-button"
						/>
					</>
				);
			}
			if (showCloseButton) {
				return (
					<Sheet.CloseButton
						onClick={onClose}
						data-flx="ui.bottom-sheet.bottom-sheet.render-trailing-content.sheet-close-button--2"
					/>
				);
			}
			return trailingAction;
		};
		return (
			<Sheet.Root
				isOpen={isOpen}
				onClose={onClose}
				snapPoints={snapPoints}
				initialSnap={initialSnap}
				surface={surface}
				zIndex={zIndex}
				className={containerClassName}
				data-flx="ui.bottom-sheet.bottom-sheet.sheet-root"
			>
				{showHandle && <Sheet.Handle data-flx="ui.bottom-sheet.bottom-sheet.sheet-handle" />}
				{shouldRenderDefaultHeader && (
					<Sheet.Header
						leading={leadingAction}
						trailing={renderTrailingContent()}
						safeAreaTop={!showHandle}
						after={headerSlot}
						data-flx="ui.bottom-sheet.bottom-sheet.sheet-header"
					>
						{title && <Sheet.Title data-flx="ui.bottom-sheet.bottom-sheet.sheet-title">{title}</Sheet.Title>}
					</Sheet.Header>
				)}
				{!shouldRenderDefaultHeader && headerSlot}
				{disablePadding ? (
					children
				) : (
					<Sheet.Content className={contentClassName} data-flx="ui.bottom-sheet.bottom-sheet.sheet-content">
						{children}
					</Sheet.Content>
				)}
			</Sheet.Root>
		);
	},
);

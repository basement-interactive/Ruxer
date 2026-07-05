// SPDX-License-Identifier: AGPL-3.0-or-later

import {FriendSelector} from '@app/features/app/components/shared/FriendSelector';
import styles from '@app/features/channel/components/bottomsheets/CreateDMBottomSheet.module.css';
import {
	CreateDMRestrictionSlate,
	DUPLICATE_GROUP_MODAL_KEY,
	useCreateDMModalLogic,
} from '@app/features/channel/utils/CreateDMModalUtils';
import {DuplicateGroupConfirmModal} from '@app/features/guild/components/modals/DuplicateGroupConfirmModal';
import {BottomSheet} from '@app/features/ui/bottom_sheet/BottomSheet';
import {Button} from '@app/features/ui/button/Button';
import * as ModalCommands from '@app/features/ui/commands/ModalCommands';
import {modal} from '@app/features/ui/commands/ModalCommands';
import {Scroller} from '@app/features/ui/components/Scroller';
import {msg} from '@lingui/core/macro';
import {Trans, useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useCallback, useLayoutEffect, useMemo, useRef, useState} from 'react';

const SELECT_FRIENDS_DESCRIPTOR = msg({
	message: 'Select friends',
	comment: 'Button or menu action label in the create dm bottom sheet. Keep it concise.',
});

interface CreateDMBottomSheetProps {
	isOpen: boolean;
	onClose: () => void;
}

type ScrollContentStyle = React.CSSProperties & {
	'--create-dm-scroll-padding-bottom'?: string;
};

export const CreateDMBottomSheet = observer(({isOpen, onClose}: CreateDMBottomSheetProps) => {
	const {i18n} = useLingui();
	const modalLogic = useCreateDMModalLogic({autoCloseOnCreate: false, resetKey: isOpen});
	const restriction = modalLogic.restriction;
	const snapPoints = useMemo(() => [0, 1], []);
	const footerRef = useRef<HTMLDivElement>(null);
	const [footerHeight, setFooterHeight] = useState(0);
	useLayoutEffect(() => {
		if (!isOpen) {
			setFooterHeight(0);
			return undefined;
		}
		const element = footerRef.current;
		if (!element) {
			return undefined;
		}
		const updateHeight = () => setFooterHeight(element.offsetHeight);
		updateHeight();
		const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateHeight) : null;
		if (resizeObserver) {
			resizeObserver.observe(element);
		}
		const handleResize = () => updateHeight();
		window.addEventListener('resize', handleResize);
		return () => {
			resizeObserver?.disconnect();
			window.removeEventListener('resize', handleResize);
		};
	}, [isOpen]);
	const scrollContentStyle = useMemo<ScrollContentStyle>(() => {
		if (footerHeight === 0) {
			return {};
		}
		return {'--create-dm-scroll-padding-bottom': `calc(${footerHeight}px + 16px)`};
	}, [footerHeight]);
	const handleCreate = useCallback(async () => {
		const result = await modalLogic.handleCreate();
		if (result && result.duplicates.length > 0) {
			ModalCommands.pushWithKey(
				modal(() => (
					<DuplicateGroupConfirmModal
						channels={result.duplicates}
						onConfirm={() => modalLogic.handleCreateChannel(result.selectionSnapshot)}
						data-flx="channel.create-dm-bottom-sheet.handle-create.duplicate-group-confirm-modal"
					/>
				)),
				DUPLICATE_GROUP_MODAL_KEY,
			);
			return;
		}
		onClose();
	}, [modalLogic, onClose]);
	return (
		<BottomSheet
			isOpen={isOpen}
			onClose={onClose}
			snapPoints={snapPoints}
			title={i18n._(SELECT_FRIENDS_DESCRIPTOR)}
			disablePadding
			data-flx="channel.create-dm-bottom-sheet.bottom-sheet"
		>
			<div className={styles.container} data-flx="channel.create-dm-bottom-sheet.container">
				<Scroller
					key="create-dm-scroller"
					className={styles.scroller}
					fade={false}
					data-flx="channel.create-dm-bottom-sheet.scroller"
				>
					<div className={styles.content} style={scrollContentStyle} data-flx="channel.create-dm-bottom-sheet.content">
						{!restriction && (
							<p className={styles.description} data-flx="channel.create-dm-bottom-sheet.description">
								{modalLogic.subtitleText}
							</p>
						)}
						{restriction ? (
							<CreateDMRestrictionSlate
								restriction={restriction}
								fullHeight={false}
								data-flx="channel.create-dm-bottom-sheet.restriction-slate"
							/>
						) : (
							<div className={styles.friendSelector} data-flx="channel.create-dm-bottom-sheet.friend-selector">
								<FriendSelector
									selectedUserIds={modalLogic.selectedUserIds}
									onToggle={modalLogic.handleToggle}
									maxSelections={modalLogic.maxSelections}
									searchQuery={modalLogic.searchQuery}
									onSearchQueryChange={modalLogic.setSearchQuery}
									data-flx="channel.create-dm-bottom-sheet.friend-selector--2"
								/>
							</div>
						)}
					</div>
				</Scroller>
				<div className={styles.footer} ref={footerRef} data-flx="channel.create-dm-bottom-sheet.footer">
					<Button
						variant="secondary"
						className={styles.cancelButton}
						onClick={onClose}
						data-flx="channel.create-dm-bottom-sheet.cancel-button.close"
					>
						<Trans>Cancel</Trans>
					</Button>
					{!restriction && (
						<Button
							variant="primary"
							className={styles.createButton}
							onClick={handleCreate}
							disabled={modalLogic.isCreating}
							submitting={modalLogic.isCreating}
							data-flx="channel.create-dm-bottom-sheet.create-button"
						>
							{modalLogic.buttonText}
						</Button>
					)}
				</div>
			</div>
		</BottomSheet>
	);
});

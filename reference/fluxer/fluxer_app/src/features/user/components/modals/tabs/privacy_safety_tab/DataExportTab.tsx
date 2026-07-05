// SPDX-License-Identifier: AGPL-3.0-or-later

import * as Modal from '@app/features/app/components/dialogs/Modal';
import {Button} from '@app/features/ui/button/Button';
import * as ModalCommands from '@app/features/ui/commands/ModalCommands';
import {modal} from '@app/features/ui/commands/ModalCommands';
import styles from '@app/features/user/components/modals/tabs/privacy_safety_tab/DataDeletionTab.module.css';
import {
	DataRequestModal,
	EXPORT_TAB_DESCRIPTION,
} from '@app/features/user/components/modals/tabs/privacy_safety_tab/data_request_modal/DataRequestModal';
import {Trans, useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useCallback} from 'react';

export const DataExportTabContent: React.FC = observer(() => {
	const {i18n} = useLingui();
	const handleOpen = useCallback(() => {
		ModalCommands.push(
			modal(() => (
				<DataRequestModal variant="export" data-flx="user.privacy-safety-tab.data-export-tab.data-request-modal" />
			)),
		);
	}, []);
	return (
		<div
			className={styles.deleteSection}
			data-flx="user.privacy-safety-tab.data-export-tab.data-export-tab-content.delete-section"
		>
			<Modal.Description
				className={styles.warningText}
				data-flx="user.privacy-safety-tab.data-export-tab.data-export-tab-content.warning-text"
			>
				{i18n._(EXPORT_TAB_DESCRIPTION)}
			</Modal.Description>
			<Button
				variant="primary"
				onClick={handleOpen}
				data-flx="user.privacy-safety-tab.data-export-tab.data-export-tab-content.button.open-modal"
			>
				<Trans>Export my data</Trans>
			</Button>
		</div>
	);
});

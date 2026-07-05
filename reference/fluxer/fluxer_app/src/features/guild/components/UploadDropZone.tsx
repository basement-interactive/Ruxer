// SPDX-License-Identifier: AGPL-3.0-or-later

import styles from '@app/features/guild/components/UploadDropZone.module.css';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {UploadIcon} from '@phosphor-icons/react';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useState} from 'react';

const DRAG_AND_DROP_AREA_FOR_FILE_UPLOAD_DESCRIPTOR = msg({
	message: 'Drag and drop area for file upload',
	comment: 'Label in the community upload drop zone.',
});

interface UploadDropZoneProps {
	onDrop: (files: Array<File>) => void;
	description: React.ReactNode;
	acceptMultiple?: boolean;
}

export const UploadDropZone: React.FC<UploadDropZoneProps> = observer(
	({onDrop, description, acceptMultiple = true}) => {
		const {i18n} = useLingui();
		const [isDragging, setIsDragging] = useState(false);
		const handleDragOver = (e: React.DragEvent) => {
			e.preventDefault();
			e.stopPropagation();
			setIsDragging(true);
		};
		const handleDragLeave = (e: React.DragEvent) => {
			e.preventDefault();
			e.stopPropagation();
			setIsDragging(false);
		};
		const handleDrop = (e: React.DragEvent) => {
			e.preventDefault();
			e.stopPropagation();
			setIsDragging(false);
			const files = Array.from(e.dataTransfer.files);
			if (files.length > 0) {
				onDrop(acceptMultiple ? files : [files[0]]);
			}
		};
		return (
			<div
				role="group"
				aria-label={i18n._(DRAG_AND_DROP_AREA_FOR_FILE_UPLOAD_DESCRIPTOR)}
				onDragOver={handleDragOver}
				onDragLeave={handleDragLeave}
				onDrop={handleDrop}
				className={`${styles.dropZone} ${isDragging ? styles.dropZoneDragging : ''}`}
				data-flx="guild.upload-drop-zone.drop-zone"
			>
				<UploadIcon className={styles.icon} data-flx="guild.upload-drop-zone.icon" />
				<p className={styles.description} data-flx="guild.upload-drop-zone.description">
					{description}
				</p>
			</div>
		);
	},
);

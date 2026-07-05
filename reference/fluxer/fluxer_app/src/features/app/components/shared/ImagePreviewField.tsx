// SPDX-License-Identifier: AGPL-3.0-or-later

import styles from '@app/features/app/components/shared/ImagePreviewField.module.css';
import type React from 'react';

export interface ImagePreviewFieldProps {
	imageUrl: string | null | undefined;
	showPlaceholder: boolean;
	placeholderText: React.ReactNode;
	altText: string;
	aspectRatio?: string | number;
	className?: string;
	objectFit?: 'cover' | 'contain';
}

function getCssAspectRatio(aspectRatio: string | number | undefined): string | undefined {
	if (typeof aspectRatio === 'number') {
		return Number.isFinite(aspectRatio) && aspectRatio > 0 ? String(aspectRatio) : undefined;
	}
	const trimmed = aspectRatio?.trim();
	return trimmed ? trimmed : undefined;
}

export const ImagePreviewField: React.FC<ImagePreviewFieldProps> = ({
	imageUrl,
	showPlaceholder,
	placeholderText,
	altText,
	aspectRatio,
	className,
	objectFit = 'cover',
}) => {
	const cssAspectRatio = getCssAspectRatio(aspectRatio);
	const containerStyle: React.CSSProperties = cssAspectRatio ? {aspectRatio: cssAspectRatio} : {};
	const ratioClassName = cssAspectRatio ? styles.withAspectRatio : '';
	const imageStyle: React.CSSProperties = {
		objectFit,
	};
	if (showPlaceholder || !imageUrl) {
		return (
			<div
				className={`${styles.placeholder} ${ratioClassName} ${className ?? ''}`}
				style={containerStyle}
				data-flx="app.image-preview-field.placeholder"
			>
				<span data-flx="app.image-preview-field.span">{placeholderText}</span>
			</div>
		);
	}
	return (
		<div
			className={`${styles.preview} ${ratioClassName} ${className ?? ''}`}
			style={containerStyle}
			data-flx="app.image-preview-field.preview"
		>
			<img
				src={imageUrl}
				alt={altText}
				className={`${styles.image} ${cssAspectRatio ? styles.imageFill : styles.imageNatural}`}
				style={imageStyle}
				data-flx="app.image-preview-field.image"
			/>
		</div>
	);
};

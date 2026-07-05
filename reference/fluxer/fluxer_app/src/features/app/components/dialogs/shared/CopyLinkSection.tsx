// SPDX-License-Identifier: AGPL-3.0-or-later

import styles from '@app/features/app/components/dialogs/shared/CopyLinkSection.module.css';
import {COPIED_DESCRIPTOR} from '@app/features/i18n/utils/CommonMessageDescriptors';
import {Button} from '@app/features/ui/button/Button';
import {Input} from '@app/features/ui/components/form/FormInput';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {type ComponentProps, type MouseEvent, type ReactNode, useCallback, useEffect, useRef, useState} from 'react';

const COPY_DESCRIPTOR = msg({
	message: 'Copy',
	comment: 'Short label in the settings dialog copy link section.',
});

interface CopyLinkSectionProps {
	label: ReactNode;
	value: string;
	placeholder?: string;
	onCopy?: () => Promise<boolean>;
	copyDisabled?: boolean;
	onInputClick?: (event: MouseEvent<HTMLInputElement>) => void;
	rightElement?: ReactNode;
	inputProps?: Partial<ComponentProps<typeof Input>>;
	children?: ReactNode;
}

export const CopyLinkSection = ({
	label,
	value,
	placeholder,
	onCopy,
	copyDisabled,
	onInputClick,
	rightElement,
	inputProps,
	children,
}: CopyLinkSectionProps) => {
	const {i18n} = useLingui();
	const [copied, setCopied] = useState(false);
	const timeoutRef = useRef<NodeJS.Timeout | null>(null);
	const buttonLabel = copied ? i18n._(COPIED_DESCRIPTOR) : i18n._(COPY_DESCRIPTOR);
	const handleCopy = useCallback(async () => {
		if (!onCopy) return;
		const success = await onCopy();
		if (!success) return;
		setCopied(true);
		if (timeoutRef.current) {
			clearTimeout(timeoutRef.current);
		}
		timeoutRef.current = setTimeout(() => {
			setCopied(false);
		}, 3000);
	}, [onCopy]);
	useEffect(() => {
		if (!value) {
			setCopied(false);
		}
	}, [value]);
	useEffect(() => {
		return () => {
			if (timeoutRef.current) {
				clearTimeout(timeoutRef.current);
			}
		};
	}, []);
	const defaultRightElement = onCopy && (
		<Button
			compact
			fitContent
			onClick={handleCopy}
			disabled={!value || copyDisabled}
			data-flx="app.copy-link-section.button.copy"
		>
			{buttonLabel}
		</Button>
	);
	return (
		<div className={styles.linkFooter} data-flx="app.copy-link-section.link-footer">
			<p className={styles.linkSectionLabel} data-flx="app.copy-link-section.link-section-label">
				{label}
			</p>
			<Input
				readOnly
				value={value}
				placeholder={placeholder}
				onClick={onInputClick}
				rightElement={rightElement ?? defaultRightElement}
				data-flx="app.copy-link-section.input"
				{...inputProps}
			/>
			{children}
		</div>
	);
};

// SPDX-License-Identifier: AGPL-3.0-or-later

import styles from '@app/features/channel/components/textarea/TextareaButton.module.css';
import type {KeybindCommand, KeyCombo} from '@app/features/input/state/InputKeybind';
import FocusRing from '@app/features/ui/focus_ring/FocusRing';
import {TooltipWithKeybind} from '@app/features/ui/keybind_hint/KeybindHint';
import {Tooltip} from '@app/features/ui/tooltip/Tooltip';
import type {Icon, IconProps} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import React, {useCallback} from 'react';

interface TextareaButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
	icon: Icon;
	label: string;
	isSelected?: boolean;
	compact?: boolean;
	iconProps?: Partial<IconProps>;
	keybindAction?: KeybindCommand;
	keybindCombo?: KeyCombo;
	forceHover?: boolean;
}

export const TextareaButton = React.forwardRef<HTMLButtonElement, TextareaButtonProps>(
	(
		{
			icon: Icon,
			label,
			onClick,
			disabled,
			isSelected,
			compact,
			iconProps,
			className,
			keybindAction,
			keybindCombo,
			forceHover,
			...props
		},
		ref,
	) => {
		const button = (
			<button
				data-flx="channel.textarea.textarea-button.button-compact.click"
				{...props}
				ref={ref}
				type="button"
				aria-label={label}
				aria-pressed={isSelected === undefined ? undefined : isSelected}
				disabled={disabled}
				onClick={onClick}
				className={clsx(
					compact ? styles.buttonCompact : styles.button,
					isSelected && styles.selected,
					forceHover && styles.contextMenuHover,
					className,
				)}
			>
				<Icon className={styles.icon} data-flx="channel.textarea.textarea-button.icon" {...iconProps} />
			</button>
		);
		const tooltipText = useCallback(
			() => (
				<TooltipWithKeybind
					label={label}
					action={keybindAction}
					combo={keybindCombo}
					data-flx="channel.textarea.textarea-button.tooltip-text.tooltip-with-keybind"
				/>
			),
			[label, keybindAction, keybindCombo],
		);
		return (
			<Tooltip text={tooltipText} position="top" data-flx="channel.textarea.textarea-button.tooltip">
				<FocusRing offset={-2} enabled={!disabled} data-flx="channel.textarea.textarea-button.focus-ring">
					{button}
				</FocusRing>
			</Tooltip>
		);
	},
);

TextareaButton.displayName = 'TextareaButton';

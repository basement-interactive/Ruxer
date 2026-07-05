// SPDX-License-Identifier: AGPL-3.0-or-later

import {Switch} from '@app/features/ui/components/form/FormSwitch';
import styles from '@app/features/ui/components/SwitchGroup.module.css';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useId} from 'react';

interface SwitchGroupItemProps {
	label: React.ReactNode;
	value: boolean;
	onChange: (value: boolean) => void;
	shortcut?: React.ReactNode;
	disabled?: boolean;
}

export const SwitchGroupItem = observer(({label, value, onChange, shortcut, disabled}: SwitchGroupItemProps) => {
	const handleClick = () => !disabled && onChange(!value);
	const labelId = useId();
	return (
		<div className={styles.item} data-flx="ui.switch-group.switch-group-item.item">
			<div className={styles.itemContent} data-flx="ui.switch-group.switch-group-item.item-content">
				<button
					type="button"
					className={clsx(styles.itemLabel, {
						[styles.itemLabelInteractive]: !disabled,
						[styles.disabled]: disabled,
					})}
					disabled={disabled}
					onClick={handleClick}
					aria-pressed={value}
					data-flx="ui.switch-group.switch-group-item.item-label.click"
				>
					<span id={labelId} className={styles.labelText} data-flx="ui.switch-group.switch-group-item.label-text">
						{label}
					</span>
					{shortcut && (
						<span className={styles.shortcut} data-flx="ui.switch-group.switch-group-item.shortcut">
							{shortcut}
						</span>
					)}
				</button>
				<Switch
					label=""
					value={value}
					onChange={onChange}
					disabled={disabled}
					ariaLabelledBy={labelId}
					data-flx="ui.switch-group.switch-group-item.switch.change"
				/>
			</div>
		</div>
	);
});

interface SwitchGroupProps {
	children: React.ReactNode;
}

export const SwitchGroup = observer(({children}: SwitchGroupProps) => {
	return (
		<div className={styles.container} data-flx="ui.switch-group.container">
			{children}
		</div>
	);
});

interface SwitchGroupCustomItemProps {
	label: React.ReactNode;
	value: boolean;
	onChange: (value: boolean) => void;
	disabled?: boolean;
	extraContent?: React.ReactNode;
}

export const SwitchGroupCustomItem = observer(
	({label, value, onChange, disabled, extraContent}: SwitchGroupCustomItemProps) => {
		const labelId = useId();
		return (
			<div className={clsx('group', styles.item)} data-flx="ui.switch-group.switch-group-custom-item.group">
				<div className={styles.itemContent} data-flx="ui.switch-group.switch-group-custom-item.item-content">
					<div className={styles.itemLabel} data-flx="ui.switch-group.switch-group-custom-item.item-label">
						<span
							id={labelId}
							className={styles.labelText}
							data-flx="ui.switch-group.switch-group-custom-item.label-text"
						>
							{label}
						</span>
					</div>
					<div className={styles.extraContent} data-flx="ui.switch-group.switch-group-custom-item.extra-content">
						{extraContent}
						<Switch
							label=""
							value={value}
							onChange={onChange}
							disabled={disabled}
							ariaLabelledBy={labelId}
							data-flx="ui.switch-group.switch-group-custom-item.switch.change"
						/>
					</div>
				</div>
			</div>
		);
	},
);

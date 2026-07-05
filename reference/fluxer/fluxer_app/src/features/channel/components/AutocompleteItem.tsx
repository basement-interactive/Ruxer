// SPDX-License-Identifier: AGPL-3.0-or-later

import styles from '@app/features/channel/components/AutocompleteItem.module.css';
import {observer} from 'mobx-react-lite';
import type React from 'react';

export const AutocompleteItem = observer(
	({
		icon,
		name,
		description,
		isKeyboardSelected,
		isHovered,
		onSelect,
		onMouseEnter,
		onMouseLeave,
		innerRef,
		...props
	}: {
		icon?: React.ReactNode;
		name: React.ReactNode;
		description?: string;
		isKeyboardSelected: boolean;
		isHovered: boolean;
		onSelect: () => void;
		onMouseEnter: () => void;
		onMouseLeave: () => void;
		innerRef?: React.Ref<HTMLButtonElement>;
	} & React.HTMLAttributes<HTMLButtonElement>) => {
		const isActive = isKeyboardSelected || isHovered;
		return (
			<button
				type="button"
				className={styles.button}
				onClick={onSelect}
				onPointerEnter={onMouseEnter}
				onPointerLeave={onMouseLeave}
				ref={innerRef}
				role="option"
				aria-selected={isKeyboardSelected}
				tabIndex={-1}
				data-flx="channel.autocomplete-item.button.select"
				{...props}
			>
				<div
					className={`${styles.container} ${isActive ? styles.selected : ''}`}
					data-flx="channel.autocomplete-item.container"
				>
					<div className={styles.content} data-flx="channel.autocomplete-item.content">
						{icon && (
							<div className={styles.icon} data-flx="channel.autocomplete-item.icon">
								{icon}
							</div>
						)}
						<div className={styles.nameWrapper} data-flx="channel.autocomplete-item.name-wrapper">
							<div className={styles.name} data-flx="channel.autocomplete-item.name">
								{name}
							</div>
						</div>
						{description && (
							<div className={styles.description} data-flx="channel.autocomplete-item.description">
								<span data-flx="channel.autocomplete-item.span">{description}</span>
							</div>
						)}
					</div>
				</div>
			</button>
		);
	},
);

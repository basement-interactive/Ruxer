// SPDX-License-Identifier: AGPL-3.0-or-later

import {LongPressable} from '@app/features/app/components/LongPressable';
import channelItemStyles from '@app/features/app/components/layout/ChannelItem.module.css';
import channelItemSurfaceStyles from '@app/features/app/components/layout/ChannelItemSurface.module.css';
import {DropIndicator} from '@app/features/app/components/layout/DropIndicator';
import type {ScrollIndicatorSeverity} from '@app/features/app/components/layout/ScrollIndicatorOverlay';
import {isKeyboardActivationKey} from '@app/features/input/utils/KeyboardUtils';
import FocusRing from '@app/features/ui/focus_ring/FocusRing';
import {CaretDownIcon} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import React from 'react';

interface GenericChannelItemProps {
	icon?: React.ReactNode;
	name?: string;
	actions?: React.ReactNode;
	badges?: React.ReactNode;
	isSelected?: boolean;
	isMuted?: boolean;
	isDragging?: boolean;
	isOver?: boolean;
	dropIndicator?: {position: 'top' | 'bottom'; isValid: boolean} | null;
	onClick?: () => void;
	onDoubleClick?: (event: React.MouseEvent) => void;
	onContextMenu?: (event: React.MouseEvent) => void;
	onKeyDown?: (event: React.KeyboardEvent) => void;
	onFocus?: (event: React.FocusEvent<HTMLElement>) => void;
	onBlur?: (event: React.FocusEvent<HTMLElement>) => void;
	onLongPress?: () => void;
	innerRef?: React.Ref<HTMLDivElement>;
	className?: string;
	pressedClassName?: string;
	containerClassName?: string;
	style?: React.CSSProperties;
	isCategory?: boolean;
	isCollapsed?: boolean;
	onToggle?: () => void;
	disabled?: boolean;
	role?: string;
	tabIndex?: number;
	children?: React.ReactNode;
	extraContent?: React.ReactNode;
	'aria-label'?: string;
	'aria-current'?: React.AriaAttributes['aria-current'];
	'aria-controls'?: string;
	'aria-describedby'?: string;
	'aria-expanded'?: boolean;
	'data-dnd-name'?: string;
	dataScrollIndicator?: ScrollIndicatorSeverity;
	dataScrollId?: string;
	onMouseEnter?: (event: React.MouseEvent) => void;
	onMouseLeave?: (event: React.MouseEvent) => void;
}

export const GenericChannelItem = React.forwardRef<HTMLDivElement, GenericChannelItemProps>(
	(
		{
			icon,
			name,
			actions,
			badges,
			isSelected,
			isOver,
			dropIndicator,
			onClick,
			onDoubleClick,
			onContextMenu,
			onKeyDown,
			onFocus,
			onBlur,
			onLongPress,
			innerRef,
			className,
			pressedClassName,
			containerClassName,
			style,
			isCategory,
			isCollapsed,
			disabled,
			role = 'button',
			tabIndex = 0,
			children,
			extraContent,
			'aria-label': ariaLabel,
			'aria-current': ariaCurrent,
			'aria-controls': ariaControls,
			'aria-describedby': ariaDescribedBy,
			'aria-expanded': ariaExpanded,
			'data-dnd-name': dataDndName,
			dataScrollIndicator,
			dataScrollId,
			onMouseEnter,
			onMouseLeave,
		},
		ref,
	) => {
		const handleKeyDown = (event: React.KeyboardEvent) => {
			onKeyDown?.(event);
			if (event.defaultPrevented || onKeyDown || disabled || !onClick) return;
			if (!isKeyboardActivationKey(event.key)) return;
			event.preventDefault();
			onClick();
		};
		return (
			<div
				className={containerClassName}
				style={{position: 'relative', ...style}}
				ref={ref}
				data-flx="app.generic-channel-item.div"
			>
				{extraContent}
				{isOver && dropIndicator && (
					<DropIndicator
						position={dropIndicator.position}
						isValid={dropIndicator.isValid}
						data-flx="app.generic-channel-item.drop-indicator"
					/>
				)}
				<FocusRing
					offset={-2}
					ringClassName={channelItemSurfaceStyles.channelItemFocusRing}
					data-flx="app.generic-channel-item.focus-ring"
				>
					<LongPressable
						ref={innerRef}
						disabled={disabled}
						className={clsx(
							channelItemSurfaceStyles.channelItemSurface,
							isSelected && channelItemSurfaceStyles.channelItemSurfaceSelected,
							className,
						)}
						pressedClassName={pressedClassName ?? channelItemStyles.channelItemPressed}
						onClick={onClick}
						onDoubleClick={onDoubleClick}
						onContextMenu={onContextMenu}
						onKeyDown={handleKeyDown}
						onFocus={onFocus}
						onBlur={onBlur}
						onMouseEnter={onMouseEnter}
						onMouseLeave={onMouseLeave}
						role={role}
						tabIndex={tabIndex}
						onLongPress={onLongPress}
						aria-label={ariaLabel}
						aria-current={ariaCurrent}
						aria-controls={ariaControls}
						aria-describedby={ariaDescribedBy}
						aria-expanded={ariaExpanded}
						data-channel-list-focus-item="true"
						data-dnd-name={dataDndName}
						data-scroll-indicator={dataScrollIndicator}
						data-scroll-id={dataScrollId}
						data-flx="app.generic-channel-item.long-pressable.click"
					>
						{children ? (
							children
						) : (
							<>
								{isCategory ? (
									<div className={channelItemStyles.categoryContainer} data-flx="app.generic-channel-item.div--2">
										<span className={channelItemStyles.categoryName} data-flx="app.generic-channel-item.span">
											{name}
										</span>
										<CaretDownIcon
											weight="bold"
											style={{transform: `rotate(${isCollapsed ? -90 : 0}deg)`}}
											data-flx="app.generic-channel-item.caret-down-icon"
										/>
									</div>
								) : (
									<>
										{icon && (
											<div className={channelItemStyles.iconContainer} data-flx="app.generic-channel-item.div--3">
												{icon}
											</div>
										)}
										<span className={channelItemStyles.channelName} data-flx="app.generic-channel-item.span--2">
											{name}
										</span>
									</>
								)}
								<div className={channelItemStyles.actionsContainer} data-flx="app.generic-channel-item.div--4">
									{actions}
									{badges}
								</div>
							</>
						)}
					</LongPressable>
				</FocusRing>
			</div>
		);
	},
);

GenericChannelItem.displayName = 'GenericChannelItem';

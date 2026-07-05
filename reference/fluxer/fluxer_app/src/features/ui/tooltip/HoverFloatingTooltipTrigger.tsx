// SPDX-License-Identifier: AGPL-3.0-or-later

import {useMergeRefs} from '@app/features/app/hooks/useMergeRefs';
import type {HoverFloatingTooltipResult} from '@app/features/ui/tooltip/useHoverFloatingTooltip';
import React from 'react';

interface HoverFloatingTooltipTriggerProps {
	tooltip: HoverFloatingTooltipResult;
	children: React.ReactElement<Record<string, unknown> & {ref?: React.Ref<HTMLElement>}>;
}

export function HoverFloatingTooltipTrigger({tooltip, children}: HoverFloatingTooltipTriggerProps) {
	const child = React.Children.only(children);
	const childRef = child.props.ref ?? null;
	const mergedRef = useMergeRefs([tooltip.targetRef, childRef]);
	return React.cloneElement(child, {
		ref: mergedRef,
		...tooltip.referenceProps,
	} as Record<string, unknown>);
}

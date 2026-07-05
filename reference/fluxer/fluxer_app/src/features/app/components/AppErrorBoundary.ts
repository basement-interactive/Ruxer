// SPDX-License-Identifier: AGPL-3.0-or-later

import {Logger} from '@app/features/platform/utils/AppLogger';
import React from 'react';

interface AppErrorBoundaryProps {
	fallback?: (error: Error | null) => React.ReactNode;
	children?: React.ReactNode;
}

interface AppErrorBoundaryState {
	hasError: boolean;
	error: Error | null;
}

const logger = new Logger('AppErrorBoundary');

export class AppErrorBoundary extends React.Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
	constructor(props: AppErrorBoundaryProps) {
		super(props);
		this.state = {hasError: false, error: null};
	}

	static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
		return {hasError: true, error};
	}

	override componentDidCatch(error: Error): void {
		logger.error('Unhandled application error:', error);
	}

	override render(): React.ReactNode {
		if (this.state.hasError) {
			return this.props.fallback?.(this.state.error) ?? null;
		}
		return this.props.children;
	}
}

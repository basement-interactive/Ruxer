// SPDX-License-Identifier: AGPL-3.0-or-later

export function shouldNavigateAfterForward(skipNavigation: boolean, destinationCount: number): boolean {
	return !skipNavigation && destinationCount === 1;
}

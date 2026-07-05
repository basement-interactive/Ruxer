// SPDX-License-Identifier: AGPL-3.0-or-later

export function shouldAutoAck(c: {
	channelActive: boolean;
	windowFocused: boolean;
	atBottom: boolean;
	textChatVisible: boolean;
	manualAck: boolean;
	blockingModalOpen: boolean;
}): boolean {
	return c.channelActive && c.windowFocused && c.atBottom && c.textChatVisible && !c.manualAck && !c.blockingModalOpen;
}

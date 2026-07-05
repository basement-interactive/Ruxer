// SPDX-License-Identifier: AGPL-3.0-or-later

const GAMEPAD_BUTTON_PRESS_THRESHOLD = 0.5;

type ReadableGamepadButton = Pick<GamepadButton, 'pressed' | 'value'>;

export function isGamepadButtonPressed(button: ReadableGamepadButton | null | undefined): boolean {
	if (!button) return false;
	if (button.pressed) return true;
	return Number.isFinite(button.value) && button.value >= GAMEPAD_BUTTON_PRESS_THRESHOLD;
}

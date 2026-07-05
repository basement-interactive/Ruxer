// SPDX-License-Identifier: AGPL-3.0-or-later

export function escapeRegex(str: string) {
	return str.replace(/[-[\]/{}()*+?.\\^$|]/g, '\\$&');
}

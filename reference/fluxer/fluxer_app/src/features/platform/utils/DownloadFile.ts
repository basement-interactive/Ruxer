// SPDX-License-Identifier: AGPL-3.0-or-later

export function downloadTextFile(text: string, fileName: string, mimeType = 'text/plain;charset=utf-8'): void {
	const blob = new Blob([text], {type: mimeType});
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement('a');
	anchor.href = url;
	anchor.download = fileName;
	anchor.rel = 'noopener';
	document.body.appendChild(anchor);
	anchor.click();
	anchor.remove();
	URL.revokeObjectURL(url);
}

// SPDX-License-Identifier: AGPL-3.0-or-later

interface PickerOptions {
	multiple?: boolean;
	accept?: string;
}

export function openFilePicker({multiple = false, accept}: PickerOptions = {}): Promise<Array<File>> {
	return new Promise((resolve) => {
		const input = document.createElement('input');
		input.type = 'file';
		input.multiple = multiple;
		if (accept) input.accept = accept;
		input.style.position = 'fixed';
		input.style.left = '-9999px';
		input.style.opacity = '0';
		input.style.pointerEvents = 'none';
		document.body.appendChild(input);
		let resolved = false;
		function cleanup() {
			if (resolved) return;
			resolved = true;
			input.remove();
		}
		input.addEventListener('change', () => {
			const files = Array.from(input.files ?? []);
			cleanup();
			resolve(files);
		});
		input.addEventListener('cancel', () => {
			cleanup();
			resolve([]);
		});
		input.click();
	});
}

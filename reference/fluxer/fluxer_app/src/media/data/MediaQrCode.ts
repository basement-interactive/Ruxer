// SPDX-License-Identifier: AGPL-3.0-or-later

import QRCode from 'qrcode';

export async function createQrDataUrl(text: string): Promise<string> {
	return QRCode.toDataURL(text, {
		errorCorrectionLevel: 'M',
		margin: 1,
		width: 240,
		color: {
			dark: '#111827',
			light: '#ffffff',
		},
	});
}

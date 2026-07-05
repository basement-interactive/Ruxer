// SPDX-License-Identifier: AGPL-3.0-or-later

import {Turnstile} from '@marsidev/react-turnstile';
import {observer} from 'mobx-react-lite';

interface TurnstileWidgetProps {
	sitekey: string;
	onVerify: (token: string) => void;
	onError?: (error: string) => void;
	onExpire?: () => void;
	theme?: 'light' | 'dark' | 'auto';
}

export const TurnstileWidget = observer(
	({sitekey, onVerify, onError, onExpire, theme = 'dark'}: TurnstileWidgetProps) => {
		return (
			<Turnstile
				siteKey={sitekey}
				onSuccess={onVerify}
				onError={() => onError?.('Turnstile error')}
				onExpire={onExpire}
				options={{
					theme,
				}}
				data-flx="auth.turnstile-widget.turnstile"
			/>
		);
	},
);

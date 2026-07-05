// SPDX-License-Identifier: AGPL-3.0-or-later

import type {IconProps} from '@phosphor-icons/react';
import React from 'react';

export const LinkChannelIcon = React.forwardRef<SVGSVGElement, IconProps>(({size = 256, className, ...props}, ref) => (
	<svg
		ref={ref}
		width={size}
		height={size}
		viewBox="0 0 256 256"
		fill="none"
		xmlns="http://www.w3.org/2000/svg"
		className={className}
		aria-hidden={true}
		data-flx="ui.icons.link-channel-icon.svg"
		{...props}
	>
		<g clipPath="url(#clip_link)" data-flx="ui.icons.link-channel-icon.g">
			<path
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={24}
				d="m108.71 197.23-5.11 5.11c-4.3345 4.335-9.481 7.773-15.1453 10.117S76.7195 216.005 70.5894 216s-12.1991-1.218-17.8599-3.57c-5.6607-2.353-10.802-5.799-15.1297-10.14-8.7201-8.751-13.6115-20.604-13.6003-32.958.0113-12.353 4.9242-24.198 13.6603-32.932l34.74-34.74c4.3292-4.3306 9.4692-7.7658 15.1262-10.1095 5.6571-2.3437 11.7204-3.55 17.844-3.55 6.123 0 12.186 1.2063 17.844 3.55 5.657 2.3437 10.797 5.7789 15.126 10.1095 6.16 6.132 10.47 13.874 12.44 22.34m-3.49-65.2301 5.11-5.11c4.329-4.3305 9.469-7.7657 15.126-10.1094s11.72-3.55 17.844-3.55c6.123 0 12.186 1.2063 17.844 3.55 5.657 2.3437 10.797 5.7789 15.126 10.1094 4.33 4.3292 7.765 9.4691 10.109 15.1262s3.55 11.7204 3.55 17.8437c0 6.1234-1.206 12.1868-3.55 17.8442-2.344 5.657-5.779 10.797-10.109 15.126l-34.74 34.74c-4.335 4.335-9.481 7.773-15.145 10.117-5.665 2.344-11.735 3.548-17.866 3.543-6.13-.005-12.199-1.218-17.859-3.57-5.661-2.353-10.802-5.799-15.13-10.14-6.125-6.13-10.413-13.851-12.38-22.29"
				data-flx="ui.icons.link-channel-icon.path"
			/>
		</g>
		<defs data-flx="ui.icons.link-channel-icon.defs">
			<clipPath id="clip_link" data-flx="ui.icons.link-channel-icon.clip-link">
				<path fill="currentColor" d="M0 0h256v256H0z" data-flx="ui.icons.link-channel-icon.path--2" />
			</clipPath>
		</defs>
	</svg>
));

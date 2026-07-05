// SPDX-License-Identifier: AGPL-3.0-or-later

import Accessibility from '@app/features/accessibility/state/Accessibility';
import {useMediaLoading} from '@app/features/messaging/hooks/useMediaLoading';
import {motion} from 'framer-motion';
import {observer} from 'mobx-react-lite';
import type {FC} from 'react';

interface PickerThumbnailProps {
	src: string;
	alt: string;
	className?: string;
	thumbHashClassName?: string;
	placeholder?: string | null;
}

export const PickerThumbnail: FC<PickerThumbnailProps> = observer(
	({src, alt, className, thumbHashClassName, placeholder}) => {
		const {loaded, error, cachedOnMount, thumbHashURL, ref, onLoad, onError} = useMediaLoading(
			src,
			placeholder ?? undefined,
		);
		const showThumbHash = (!loaded || error) && Boolean(thumbHashURL);
		return (
			<>
				{showThumbHash && (
					<img
						src={thumbHashURL}
						alt=""
						aria-hidden
						className={thumbHashClassName ?? className}
						data-flx="channel.pickers.picker-thumbnail.img"
					/>
				)}
				{!error && (
					<motion.img
						src={src}
						ref={ref}
						alt={alt}
						loading="lazy"
						className={className}
						onLoad={onLoad}
						onError={onError}
						initial={{opacity: cachedOnMount ? 1 : 0}}
						animate={{opacity: loaded ? 1 : 0}}
						transition={{duration: cachedOnMount || Accessibility.useReducedMotion ? 0 : 0.2}}
						data-flx="channel.pickers.picker-thumbnail.img--2"
					/>
				)}
			</>
		);
	},
);

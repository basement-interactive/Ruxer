// SPDX-License-Identifier: AGPL-3.0-or-later

import {useExpressionImagePreload} from '@app/features/expressions/utils/ExpressionImageCache';
import type React from 'react';

type ReactionImageProps = Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'alt' | 'src'> & {
	src: string;
	alt: string;
};

export const ReactionImage: React.FC<ReactionImageProps> = ({
	src,
	alt,
	decoding = 'async',
	loading = 'eager',
	...props
}) => {
	useExpressionImagePreload(src);
	return (
		<img src={src} alt={alt} decoding={decoding} loading={loading} data-flx="messaging.reaction-image.img" {...props} />
	);
};

// SPDX-License-Identifier: AGPL-3.0-or-later

import type {FavoriteMeme} from '@app/features/expressions/models/FavoriteMeme';
import * as FavoriteMemeUtils from '@app/features/expressions/utils/FavoriteMemeUtils';

export function findFavoriteMemeForGif(
	memes: ReadonlyArray<FavoriteMeme>,
	{
		gifProvider,
		primaryGifSlug,
		fallbackGifSlug,
	}: {
		gifProvider: string | null | undefined;
		primaryGifSlug: string | null | undefined;
		fallbackGifSlug?: string | null;
	},
): FavoriteMeme | null {
	const favoriteMeme = FavoriteMemeUtils.findFavoritedMeme(memes, {
		gifProvider,
		gifSlug: primaryGifSlug,
	});
	if (favoriteMeme) return favoriteMeme;
	if (!fallbackGifSlug || fallbackGifSlug === primaryGifSlug) return null;
	return FavoriteMemeUtils.findFavoritedMeme(memes, {
		gifProvider,
		gifSlug: fallbackGifSlug,
	});
}

export function isGifFavoriteActive({
	hasUrlOnlyFavorite,
	hasSavedMediaFavorite,
	saveAsSavedMedia,
}: {
	hasUrlOnlyFavorite: boolean;
	hasSavedMediaFavorite: boolean;
	saveAsSavedMedia: boolean;
}): boolean {
	return hasUrlOnlyFavorite || (saveAsSavedMedia && hasSavedMediaFavorite);
}

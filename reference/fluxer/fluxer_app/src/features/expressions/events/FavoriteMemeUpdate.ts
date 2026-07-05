// SPDX-License-Identifier: AGPL-3.0-or-later

import type {FavoriteMemeWire} from '@app/features/expressions/models/FavoriteMeme';
import FavoriteMemes from '@app/features/expressions/state/FavoriteMemes';
import type {GatewayHandlerContext} from '@app/features/gateway/events/EventRouter';

export function handleFavoriteMemeUpdate(data: FavoriteMemeWire, _context: GatewayHandlerContext): void {
	FavoriteMemes.updateMeme(data);
}

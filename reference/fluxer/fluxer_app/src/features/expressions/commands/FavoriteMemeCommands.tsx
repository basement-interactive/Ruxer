// SPDX-License-Identifier: AGPL-3.0-or-later

import {MaxFavoriteMemesModal} from '@app/features/app/components/alerts/MaxFavoriteMemesModal';
import {Endpoints} from '@app/features/app/constants/Endpoints';
import type {FavoriteMemeWire} from '@app/features/expressions/models/FavoriteMeme';
import FavoriteMemes from '@app/features/expressions/state/FavoriteMemes';
import {http} from '@app/features/platform/transport/RestTransport';
import {Logger} from '@app/features/platform/utils/AppLogger';
import {failureCode} from '@app/features/platform/utils/ResponseInspection';
import * as ModalCommands from '@app/features/ui/commands/ModalCommands';
import {modal} from '@app/features/ui/commands/ModalCommands';
import * as ToastCommands from '@app/features/ui/commands/ToastCommands';
import {APIErrorCodes} from '@fluxer/constants/src/ApiErrorCodes';
import {ME} from '@fluxer/constants/src/AppConstants';
import type {GifMediaFormat} from '@fluxer/schema/src/domains/gif/GifSchemas';
import type {I18n} from '@lingui/core';
import {msg} from '@lingui/core/macro';

const ADDED_TO_SAVED_MEDIA_DESCRIPTOR = msg({
	message: 'Added to saved media',
	comment: 'Toast confirming a media was added to saved media (favorite memes).',
});
const UPDATED_SAVED_MEDIA_DESCRIPTOR = msg({
	message: 'Updated saved media',
	comment: 'Toast confirming the saved media entry was updated.',
});
const REMOVED_FROM_SAVED_MEDIA_DESCRIPTOR = msg({
	message: 'Removed from saved media',
	comment: 'Toast confirming a saved media entry was removed.',
});
const logger = new Logger('FavoriteMemes');

interface FavoriteMemeFromMessageParams {
	channelId: string;
	messageId: string;
	attachmentId?: string;
	embedIndex?: number;
	name: string;
	altText?: string;
	tags?: Array<string>;
}

interface FavoriteMemeFromUrlParams {
	url: string;
	name: string;
	altText?: string;
	tags?: Array<string>;
	gifSlug?: string;
	gifProvider?: string;
	media?: Record<string, GifMediaFormat>;
}

interface FavoriteMemeUpdateParams {
	memeId: string;
	name?: string;
	altText?: string | null;
	tags?: Array<string>;
}

function favoriteMemeFromMessageBody({
	attachmentId,
	embedIndex,
	name,
	altText,
	tags,
}: FavoriteMemeFromMessageParams): Record<string, string | number | Array<string> | undefined> {
	return {
		attachment_id: attachmentId,
		embed_index: embedIndex,
		name,
		alt_text: altText,
		tags,
	};
}

function favoriteMemeFromUrlBody({
	url,
	name,
	altText,
	tags,
	gifSlug,
	gifProvider,
	media,
}: FavoriteMemeFromUrlParams): Record<string, string | Array<string> | Record<string, GifMediaFormat> | undefined> {
	return {
		url,
		name,
		alt_text: altText,
		tags,
		gif_slug: gifSlug,
		gif_provider: gifProvider,
		media,
	};
}

function favoriteMemeUpdateBody({
	name,
	altText,
	tags,
}: FavoriteMemeUpdateParams): Record<string, string | Array<string> | null | undefined> {
	return {
		name,
		alt_text: altText,
		tags,
	};
}

function successToast(message: string): void {
	ToastCommands.createToast({
		type: 'success',
		children: message,
	});
}

function handleFavoriteMemeCreateFailure(error: unknown): boolean {
	if (failureCode(error) !== APIErrorCodes.MAX_FAVORITE_MEMES) {
		return false;
	}
	ModalCommands.push(
		modal(() => (
			<MaxFavoriteMemesModal data-flx="expressions.favorite-meme-commands.handle-favorite-meme-create-failure.max-favorite-memes-modal" />
		)),
	);
	return true;
}

export async function createFavoriteMeme(i18n: I18n, params: FavoriteMemeFromMessageParams): Promise<void> {
	const {channelId, messageId} = params;
	try {
		await http.post<FavoriteMemeWire>(Endpoints.CHANNEL_MESSAGE_FAVORITE_MEMES(channelId, messageId), {
			body: favoriteMemeFromMessageBody(params),
		});
		successToast(i18n._(ADDED_TO_SAVED_MEDIA_DESCRIPTOR));
		logger.debug(`Successfully added favorite meme from message ${messageId}`);
	} catch (error: unknown) {
		logger.error(`Failed to add favorite meme from message ${messageId}:`, error);
		if (handleFavoriteMemeCreateFailure(error)) return;
		throw error;
	}
}

export async function createFavoriteMemeFromUrl(i18n: I18n, params: FavoriteMemeFromUrlParams): Promise<void> {
	const {url} = params;
	try {
		await http.post<FavoriteMemeWire>(Endpoints.USER_FAVORITE_MEMES(ME), {
			body: favoriteMemeFromUrlBody(params),
		});
		successToast(i18n._(ADDED_TO_SAVED_MEDIA_DESCRIPTOR));
		logger.debug(`Successfully added favorite meme from URL ${url}`);
	} catch (error: unknown) {
		logger.error(`Failed to add favorite meme from URL ${url}:`, error);
		if (handleFavoriteMemeCreateFailure(error)) return;
		throw error;
	}
}

export async function updateFavoriteMeme(i18n: I18n, params: FavoriteMemeUpdateParams): Promise<void> {
	const {memeId} = params;
	try {
		const response = await http.patch<FavoriteMemeWire>(Endpoints.USER_FAVORITE_MEME(ME, memeId), {
			body: favoriteMemeUpdateBody(params),
		});
		FavoriteMemes.updateMeme(response.body);
		successToast(i18n._(UPDATED_SAVED_MEDIA_DESCRIPTOR));
		logger.debug(`Successfully updated favorite meme ${memeId}`);
	} catch (error) {
		logger.error(`Failed to update favorite meme ${memeId}:`, error);
		throw error;
	}
}

export async function deleteFavoriteMeme(i18n: I18n, memeId: string): Promise<void> {
	try {
		await http.delete(Endpoints.USER_FAVORITE_MEME(ME, memeId));
		FavoriteMemes.deleteMeme(memeId);
		successToast(i18n._(REMOVED_FROM_SAVED_MEDIA_DESCRIPTOR));
		logger.debug(`Successfully deleted favorite meme ${memeId}`);
	} catch (error) {
		logger.error(`Failed to delete favorite meme ${memeId}:`, error);
		throw error;
	}
}

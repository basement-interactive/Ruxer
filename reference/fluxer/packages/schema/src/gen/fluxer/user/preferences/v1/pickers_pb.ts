import type { GenEnum, GenFile, GenMessage } from "@bufbuild/protobuf/codegenv2";
import { enumDesc, fileDesc, messageDesc } from "@bufbuild/protobuf/codegenv2";
import type { Message } from "@bufbuild/protobuf";

/**
 * Describes the file fluxer/user/preferences/v1/pickers.proto.
 */
export const file_fluxer_user_preferences_v1_pickers: GenFile = /*@__PURE__*/
  fileDesc("CihmbHV4ZXIvdXNlci9wcmVmZXJlbmNlcy92MS9waWNrZXJzLnByb3RvEhpmbHV4ZXIudXNlci5wcmVmZXJlbmNlcy52MSIwCglVc2FnZVN0YXQSDQoFY291bnQYASABKA0SFAoMbGFzdF91c2VkX21zGAIgASgDIusBChBFbW9qaVBpY2tlclN0YXRlEkYKBXVzYWdlGAEgAygLMjcuZmx1eGVyLnVzZXIucHJlZmVyZW5jZXMudjEuRW1vamlQaWNrZXJTdGF0ZS5Vc2FnZUVudHJ5EhoKEmZhdm9yaXRlX2Vtb2ppX2lkcxgCIAMoCRIeChZjb2xsYXBzZWRfY2F0ZWdvcnlfaWRzGAMgAygJGlMKClVzYWdlRW50cnkSCwoDa2V5GAEgASgJEjQKBXZhbHVlGAIgASgLMiUuZmx1eGVyLnVzZXIucHJlZmVyZW5jZXMudjEuVXNhZ2VTdGF0OgI4ASLxAQoSU3RpY2tlclBpY2tlclN0YXRlEkgKBXVzYWdlGAEgAygLMjkuZmx1eGVyLnVzZXIucHJlZmVyZW5jZXMudjEuU3RpY2tlclBpY2tlclN0YXRlLlVzYWdlRW50cnkSHAoUZmF2b3JpdGVfc3RpY2tlcl9pZHMYAiADKAkSHgoWY29sbGFwc2VkX2NhdGVnb3J5X2lkcxgDIAMoCRpTCgpVc2FnZUVudHJ5EgsKA2tleRgBIAEoCRI0CgV2YWx1ZRgCIAEoCzIlLmZsdXhlci51c2VyLnByZWZlcmVuY2VzLnYxLlVzYWdlU3RhdDoCOAEi6gEKEE1lbWVzUGlja2VyU3RhdGUSRgoFdXNhZ2UYASADKAsyNy5mbHV4ZXIudXNlci5wcmVmZXJlbmNlcy52MS5NZW1lc1BpY2tlclN0YXRlLlVzYWdlRW50cnkSGQoRZmF2b3JpdGVfbWVtZV9pZHMYAiADKAkSHgoWY29sbGFwc2VkX2NhdGVnb3J5X2lkcxgDIAMoCRpTCgpVc2FnZUVudHJ5EgsKA2tleRgBIAEoCRI0CgV2YWx1ZRgCIAEoCzIlLmZsdXhlci51c2VyLnByZWZlcmVuY2VzLnYxLlVzYWdlU3RhdDoCOAEiHwoKRW1vamlTdGF0ZRIRCglza2luX3RvbmUYASABKAkirwEKGkVtb2ppU3RpY2tlckxheW91dFNldHRpbmdzEkMKDGVtb2ppX2xheW91dBgBIAEoDjItLmZsdXhlci51c2VyLnByZWZlcmVuY2VzLnYxLkVtb2ppUGlja2VyTGF5b3V0EkwKEXN0aWNrZXJfdmlld19tb2RlGAIgASgOMjEuZmx1eGVyLnVzZXIucHJlZmVyZW5jZXMudjEuU3RpY2tlclBpY2tlclZpZXdNb2RlIpEBChNGYXZvcml0ZUdpZlNldHRpbmdzEj0KB2VudHJpZXMYASADKAsyLC5mbHV4ZXIudXNlci5wcmVmZXJlbmNlcy52MS5GYXZvcml0ZUdpZkVudHJ5EhsKE3NhdmVfYXNfc2F2ZWRfbWVkaWEYAiABKAgSHgoWc2Vlbl9maXJzdF90aW1lX3Byb21wdBgDIAEoCCJXChZGYXZvcml0ZUdpZk1lZGlhRm9ybWF0EgsKA3NyYxgBIAEoCRIRCglwcm94eV9zcmMYAiABKAkSDQoFd2lkdGgYAyABKA0SDgoGaGVpZ2h0GAQgASgNIqYCChBGYXZvcml0ZUdpZkVudHJ5EgsKA3VybBgBIAEoCRIRCglwcm94eV91cmwYAiABKAkSDQoFd2lkdGgYAyABKA0SDgoGaGVpZ2h0GAQgASgNEkYKBW1lZGlhGAUgAygLMjcuZmx1eGVyLnVzZXIucHJlZmVyZW5jZXMudjEuRmF2b3JpdGVHaWZFbnRyeS5NZWRpYUVudHJ5EhQKDGNvbnRlbnRfdHlwZRgGIAEoCRITCgtwbGFjZWhvbGRlchgHIAEoCRpgCgpNZWRpYUVudHJ5EgsKA2tleRgBIAEoCRJBCgV2YWx1ZRgCIAEoCzIyLmZsdXhlci51c2VyLnByZWZlcmVuY2VzLnYxLkZhdm9yaXRlR2lmTWVkaWFGb3JtYXQ6AjgBIvgCCg1Tb3VuZFNldHRpbmdzEhsKE2FsbF9zb3VuZHNfZGlzYWJsZWQYASABKAgSGgoNbWFzdGVyX3ZvbHVtZRgCIAEoAUgAiAEBElYKD2Rpc2FibGVkX3NvdW5kcxgDIAMoCzI9LmZsdXhlci51c2VyLnByZWZlcmVuY2VzLnYxLlNvdW5kU2V0dGluZ3MuRGlzYWJsZWRTb3VuZHNFbnRyeRJWCg9zb3VuZF9vdmVycmlkZXMYBCADKAsyPS5mbHV4ZXIudXNlci5wcmVmZXJlbmNlcy52MS5Tb3VuZFNldHRpbmdzLlNvdW5kT3ZlcnJpZGVzRW50cnkaNQoTRGlzYWJsZWRTb3VuZHNFbnRyeRILCgNrZXkYASABKAkSDQoFdmFsdWUYAiABKAg6AjgBGjUKE1NvdW5kT3ZlcnJpZGVzRW50cnkSCwoDa2V5GAEgASgJEg0KBXZhbHVlGAIgASgBOgI4AUIQCg5fbWFzdGVyX3ZvbHVtZSp0ChFFbW9qaVBpY2tlckxheW91dBIjCh9FTU9KSV9QSUNLRVJfTEFZT1VUX1VOU1BFQ0lGSUVEEAASHAoYRU1PSklfUElDS0VSX0xBWU9VVF9MSVNUEAESHAoYRU1PSklfUElDS0VSX0xBWU9VVF9HUklEEAIqigEKFVN0aWNrZXJQaWNrZXJWaWV3TW9kZRIoCiRTVElDS0VSX1BJQ0tFUl9WSUVXX01PREVfVU5TUEVDSUZJRUQQABIhCh1TVElDS0VSX1BJQ0tFUl9WSUVXX01PREVfQ09aWRABEiQKIFNUSUNLRVJfUElDS0VSX1ZJRVdfTU9ERV9DT01QQUNUEAIq2AMKCVNvdW5kVHlwZRIaChZTT1VORF9UWVBFX1VOU1BFQ0lGSUVEEAASEwoPU09VTkRfVFlQRV9ERUFGEAESFQoRU09VTkRfVFlQRV9VTkRFQUYQAhITCg9TT1VORF9UWVBFX01VVEUQAxIVChFTT1VORF9UWVBFX1VOTVVURRAEEhYKElNPVU5EX1RZUEVfTUVTU0FHRRAFEhwKGFNPVU5EX1RZUEVfSU5DT01JTkdfUklORxAGEhgKFFNPVU5EX1RZUEVfVVNFUl9KT0lOEAcSGQoVU09VTkRfVFlQRV9VU0VSX0xFQVZFEAgSGAoUU09VTkRfVFlQRV9VU0VSX01PVkUQCRIaChZTT1VORF9UWVBFX1ZJRVdFUl9KT0lOEAoSGwoXU09VTkRfVFlQRV9WSUVXRVJfTEVBVkUQCxIfChtTT1VORF9UWVBFX1ZPSUNFX0RJU0NPTk5FQ1QQDBIYChRTT1VORF9UWVBFX0NBTUVSQV9PThANEhkKFVNPVU5EX1RZUEVfQ0FNRVJBX09GRhAOEiEKHVNPVU5EX1RZUEVfU0NSRUVOX1NIQVJFX1NUQVJUEA8SIAocU09VTkRfVFlQRV9TQ1JFRU5fU0hBUkVfU1RPUBAQYgZwcm90bzM");

/**
 * @generated from message fluxer.user.preferences.v1.UsageStat
 */
export type UsageStat = Message<"fluxer.user.preferences.v1.UsageStat"> & {
  /**
   * @generated from field: uint32 count = 1;
   */
  count: number;

  /**
   * @generated from field: int64 last_used_ms = 2;
   */
  lastUsedMs: bigint;
};

/**
 * Describes the message fluxer.user.preferences.v1.UsageStat.
 * Use `create(UsageStatSchema)` to create a new message.
 */
export const UsageStatSchema: GenMessage<UsageStat> = /*@__PURE__*/
  messageDesc(file_fluxer_user_preferences_v1_pickers, 0);

/**
 * @generated from message fluxer.user.preferences.v1.EmojiPickerState
 */
export type EmojiPickerState = Message<"fluxer.user.preferences.v1.EmojiPickerState"> & {
  /**
   * @generated from field: map<string, fluxer.user.preferences.v1.UsageStat> usage = 1;
   */
  usage: { [key: string]: UsageStat };

  /**
   * @generated from field: repeated string favorite_emoji_ids = 2;
   */
  favoriteEmojiIds: string[];

  /**
   * @generated from field: repeated string collapsed_category_ids = 3;
   */
  collapsedCategoryIds: string[];
};

/**
 * Describes the message fluxer.user.preferences.v1.EmojiPickerState.
 * Use `create(EmojiPickerStateSchema)` to create a new message.
 */
export const EmojiPickerStateSchema: GenMessage<EmojiPickerState> = /*@__PURE__*/
  messageDesc(file_fluxer_user_preferences_v1_pickers, 1);

/**
 * @generated from message fluxer.user.preferences.v1.StickerPickerState
 */
export type StickerPickerState = Message<"fluxer.user.preferences.v1.StickerPickerState"> & {
  /**
   * @generated from field: map<string, fluxer.user.preferences.v1.UsageStat> usage = 1;
   */
  usage: { [key: string]: UsageStat };

  /**
   * @generated from field: repeated string favorite_sticker_ids = 2;
   */
  favoriteStickerIds: string[];

  /**
   * @generated from field: repeated string collapsed_category_ids = 3;
   */
  collapsedCategoryIds: string[];
};

/**
 * Describes the message fluxer.user.preferences.v1.StickerPickerState.
 * Use `create(StickerPickerStateSchema)` to create a new message.
 */
export const StickerPickerStateSchema: GenMessage<StickerPickerState> = /*@__PURE__*/
  messageDesc(file_fluxer_user_preferences_v1_pickers, 2);

/**
 * @generated from message fluxer.user.preferences.v1.MemesPickerState
 */
export type MemesPickerState = Message<"fluxer.user.preferences.v1.MemesPickerState"> & {
  /**
   * @generated from field: map<string, fluxer.user.preferences.v1.UsageStat> usage = 1;
   */
  usage: { [key: string]: UsageStat };

  /**
   * @generated from field: repeated string favorite_meme_ids = 2;
   */
  favoriteMemeIds: string[];

  /**
   * @generated from field: repeated string collapsed_category_ids = 3;
   */
  collapsedCategoryIds: string[];
};

/**
 * Describes the message fluxer.user.preferences.v1.MemesPickerState.
 * Use `create(MemesPickerStateSchema)` to create a new message.
 */
export const MemesPickerStateSchema: GenMessage<MemesPickerState> = /*@__PURE__*/
  messageDesc(file_fluxer_user_preferences_v1_pickers, 3);

/**
 * @generated from message fluxer.user.preferences.v1.EmojiState
 */
export type EmojiState = Message<"fluxer.user.preferences.v1.EmojiState"> & {
  /**
   * @generated from field: string skin_tone = 1;
   */
  skinTone: string;
};

/**
 * Describes the message fluxer.user.preferences.v1.EmojiState.
 * Use `create(EmojiStateSchema)` to create a new message.
 */
export const EmojiStateSchema: GenMessage<EmojiState> = /*@__PURE__*/
  messageDesc(file_fluxer_user_preferences_v1_pickers, 4);

/**
 * @generated from message fluxer.user.preferences.v1.EmojiStickerLayoutSettings
 */
export type EmojiStickerLayoutSettings = Message<"fluxer.user.preferences.v1.EmojiStickerLayoutSettings"> & {
  /**
   * @generated from field: fluxer.user.preferences.v1.EmojiPickerLayout emoji_layout = 1;
   */
  emojiLayout: EmojiPickerLayout;

  /**
   * @generated from field: fluxer.user.preferences.v1.StickerPickerViewMode sticker_view_mode = 2;
   */
  stickerViewMode: StickerPickerViewMode;
};

/**
 * Describes the message fluxer.user.preferences.v1.EmojiStickerLayoutSettings.
 * Use `create(EmojiStickerLayoutSettingsSchema)` to create a new message.
 */
export const EmojiStickerLayoutSettingsSchema: GenMessage<EmojiStickerLayoutSettings> = /*@__PURE__*/
  messageDesc(file_fluxer_user_preferences_v1_pickers, 5);

/**
 * @generated from message fluxer.user.preferences.v1.FavoriteGifSettings
 */
export type FavoriteGifSettings = Message<"fluxer.user.preferences.v1.FavoriteGifSettings"> & {
  /**
   * @generated from field: repeated fluxer.user.preferences.v1.FavoriteGifEntry entries = 1;
   */
  entries: FavoriteGifEntry[];

  /**
   * @generated from field: bool save_as_saved_media = 2;
   */
  saveAsSavedMedia: boolean;

  /**
   * @generated from field: bool seen_first_time_prompt = 3;
   */
  seenFirstTimePrompt: boolean;
};

/**
 * Describes the message fluxer.user.preferences.v1.FavoriteGifSettings.
 * Use `create(FavoriteGifSettingsSchema)` to create a new message.
 */
export const FavoriteGifSettingsSchema: GenMessage<FavoriteGifSettings> = /*@__PURE__*/
  messageDesc(file_fluxer_user_preferences_v1_pickers, 6);

/**
 * @generated from message fluxer.user.preferences.v1.FavoriteGifMediaFormat
 */
export type FavoriteGifMediaFormat = Message<"fluxer.user.preferences.v1.FavoriteGifMediaFormat"> & {
  /**
   * @generated from field: string src = 1;
   */
  src: string;

  /**
   * @generated from field: string proxy_src = 2;
   */
  proxySrc: string;

  /**
   * @generated from field: uint32 width = 3;
   */
  width: number;

  /**
   * @generated from field: uint32 height = 4;
   */
  height: number;
};

/**
 * Describes the message fluxer.user.preferences.v1.FavoriteGifMediaFormat.
 * Use `create(FavoriteGifMediaFormatSchema)` to create a new message.
 */
export const FavoriteGifMediaFormatSchema: GenMessage<FavoriteGifMediaFormat> = /*@__PURE__*/
  messageDesc(file_fluxer_user_preferences_v1_pickers, 7);

/**
 * @generated from message fluxer.user.preferences.v1.FavoriteGifEntry
 */
export type FavoriteGifEntry = Message<"fluxer.user.preferences.v1.FavoriteGifEntry"> & {
  /**
   * @generated from field: string url = 1;
   */
  url: string;

  /**
   * @generated from field: string proxy_url = 2;
   */
  proxyUrl: string;

  /**
   * @generated from field: uint32 width = 3;
   */
  width: number;

  /**
   * @generated from field: uint32 height = 4;
   */
  height: number;

  /**
   * @generated from field: map<string, fluxer.user.preferences.v1.FavoriteGifMediaFormat> media = 5;
   */
  media: { [key: string]: FavoriteGifMediaFormat };

  /**
   * @generated from field: string content_type = 6;
   */
  contentType: string;

  /**
   * @generated from field: string placeholder = 7;
   */
  placeholder: string;
};

/**
 * Describes the message fluxer.user.preferences.v1.FavoriteGifEntry.
 * Use `create(FavoriteGifEntrySchema)` to create a new message.
 */
export const FavoriteGifEntrySchema: GenMessage<FavoriteGifEntry> = /*@__PURE__*/
  messageDesc(file_fluxer_user_preferences_v1_pickers, 8);

/**
 * @generated from message fluxer.user.preferences.v1.SoundSettings
 */
export type SoundSettings = Message<"fluxer.user.preferences.v1.SoundSettings"> & {
  /**
   * @generated from field: bool all_sounds_disabled = 1;
   */
  allSoundsDisabled: boolean;

  /**
   * @generated from field: optional double master_volume = 2;
   */
  masterVolume?: number | undefined;

  /**
   * @generated from field: map<string, bool> disabled_sounds = 3;
   */
  disabledSounds: { [key: string]: boolean };

  /**
   * @generated from field: map<string, double> sound_overrides = 4;
   */
  soundOverrides: { [key: string]: number };
};

/**
 * Describes the message fluxer.user.preferences.v1.SoundSettings.
 * Use `create(SoundSettingsSchema)` to create a new message.
 */
export const SoundSettingsSchema: GenMessage<SoundSettings> = /*@__PURE__*/
  messageDesc(file_fluxer_user_preferences_v1_pickers, 9);

/**
 * @generated from enum fluxer.user.preferences.v1.EmojiPickerLayout
 */
export enum EmojiPickerLayout {
  /**
   * @generated from enum value: EMOJI_PICKER_LAYOUT_UNSPECIFIED = 0;
   */
  UNSPECIFIED = 0,

  /**
   * @generated from enum value: EMOJI_PICKER_LAYOUT_LIST = 1;
   */
  LIST = 1,

  /**
   * @generated from enum value: EMOJI_PICKER_LAYOUT_GRID = 2;
   */
  GRID = 2,
}

/**
 * Describes the enum fluxer.user.preferences.v1.EmojiPickerLayout.
 */
export const EmojiPickerLayoutSchema: GenEnum<EmojiPickerLayout> = /*@__PURE__*/
  enumDesc(file_fluxer_user_preferences_v1_pickers, 0);

/**
 * @generated from enum fluxer.user.preferences.v1.StickerPickerViewMode
 */
export enum StickerPickerViewMode {
  /**
   * @generated from enum value: STICKER_PICKER_VIEW_MODE_UNSPECIFIED = 0;
   */
  UNSPECIFIED = 0,

  /**
   * @generated from enum value: STICKER_PICKER_VIEW_MODE_COZY = 1;
   */
  COZY = 1,

  /**
   * @generated from enum value: STICKER_PICKER_VIEW_MODE_COMPACT = 2;
   */
  COMPACT = 2,
}

/**
 * Describes the enum fluxer.user.preferences.v1.StickerPickerViewMode.
 */
export const StickerPickerViewModeSchema: GenEnum<StickerPickerViewMode> = /*@__PURE__*/
  enumDesc(file_fluxer_user_preferences_v1_pickers, 1);

/**
 * @generated from enum fluxer.user.preferences.v1.SoundType
 */
export enum SoundType {
  /**
   * @generated from enum value: SOUND_TYPE_UNSPECIFIED = 0;
   */
  UNSPECIFIED = 0,

  /**
   * @generated from enum value: SOUND_TYPE_DEAF = 1;
   */
  DEAF = 1,

  /**
   * @generated from enum value: SOUND_TYPE_UNDEAF = 2;
   */
  UNDEAF = 2,

  /**
   * @generated from enum value: SOUND_TYPE_MUTE = 3;
   */
  MUTE = 3,

  /**
   * @generated from enum value: SOUND_TYPE_UNMUTE = 4;
   */
  UNMUTE = 4,

  /**
   * @generated from enum value: SOUND_TYPE_MESSAGE = 5;
   */
  MESSAGE = 5,

  /**
   * @generated from enum value: SOUND_TYPE_INCOMING_RING = 6;
   */
  INCOMING_RING = 6,

  /**
   * @generated from enum value: SOUND_TYPE_USER_JOIN = 7;
   */
  USER_JOIN = 7,

  /**
   * @generated from enum value: SOUND_TYPE_USER_LEAVE = 8;
   */
  USER_LEAVE = 8,

  /**
   * @generated from enum value: SOUND_TYPE_USER_MOVE = 9;
   */
  USER_MOVE = 9,

  /**
   * @generated from enum value: SOUND_TYPE_VIEWER_JOIN = 10;
   */
  VIEWER_JOIN = 10,

  /**
   * @generated from enum value: SOUND_TYPE_VIEWER_LEAVE = 11;
   */
  VIEWER_LEAVE = 11,

  /**
   * @generated from enum value: SOUND_TYPE_VOICE_DISCONNECT = 12;
   */
  VOICE_DISCONNECT = 12,

  /**
   * @generated from enum value: SOUND_TYPE_CAMERA_ON = 13;
   */
  CAMERA_ON = 13,

  /**
   * @generated from enum value: SOUND_TYPE_CAMERA_OFF = 14;
   */
  CAMERA_OFF = 14,

  /**
   * @generated from enum value: SOUND_TYPE_SCREEN_SHARE_START = 15;
   */
  SCREEN_SHARE_START = 15,

  /**
   * @generated from enum value: SOUND_TYPE_SCREEN_SHARE_STOP = 16;
   */
  SCREEN_SHARE_STOP = 16,
}

/**
 * Describes the enum fluxer.user.preferences.v1.SoundType.
 */
export const SoundTypeSchema: GenEnum<SoundType> = /*@__PURE__*/
  enumDesc(file_fluxer_user_preferences_v1_pickers, 2);

// SPDX-License-Identifier: AGPL-3.0-or-later

import {Locales} from '@fluxer/constants/src/Locales';

export const DEFAULT_LOCALE = Locales.EN_US;
export const MS_PER_SECOND = 1000;
export const SECONDS_PER_MINUTE = 60;
export const MINUTES_PER_HOUR = 60;
export const HOURS_PER_DAY = 24;
export const DAYS_PER_WEEK = 7;
export const DAYS_PER_MONTH = 30;
export const DAYS_PER_YEAR = 365;
export const MS_PER_MINUTE = SECONDS_PER_MINUTE * MS_PER_SECOND;
export const MS_PER_HOUR = MINUTES_PER_HOUR * MS_PER_MINUTE;
export const MS_PER_DAY = HOURS_PER_DAY * MS_PER_HOUR;
export const SECONDS_PER_HOUR = MINUTES_PER_HOUR * SECONDS_PER_MINUTE;
export const SECONDS_PER_DAY = HOURS_PER_DAY * SECONDS_PER_HOUR;

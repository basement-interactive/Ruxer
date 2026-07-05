// SPDX-License-Identifier: AGPL-3.0-or-later

interface HolidayEntry {
	slug: string;
	month: number;
	day: number;
	endMonth?: number;
	endDay?: number;
}

const HOLIDAYS: ReadonlyArray<HolidayEntry> = [
	{slug: 'new-years-day', month: 1, day: 1},
	{slug: 'india-republic-day', month: 1, day: 26},
	{slug: 'valentines-day', month: 2, day: 14},
	{slug: 'intl-womens-day', month: 3, day: 8},
	{slug: 'pi-day', month: 3, day: 14},
	{slug: 'st-patricks-day', month: 3, day: 17},
	{slug: 'greece-independence', month: 3, day: 25},
	{slug: 'april-fools', month: 4, day: 1},
	{slug: 'earth-day', month: 4, day: 22},
	{slug: 'netherlands-kings-day', month: 4, day: 27},
	{slug: 'south-africa-freedom-day', month: 4, day: 27},
	{slug: 'vietnam-reunification', month: 4, day: 30},
	{slug: 'may-day', month: 5, day: 1},
	{slug: 'labour-day', month: 5, day: 1},
	{slug: 'polish-constitution-day', month: 5, day: 3},
	{slug: 'star-wars-day', month: 5, day: 4},
	{slug: 'japan-childrens-day', month: 5, day: 5},
	{slug: 'cinco-de-mayo', month: 5, day: 5},
	{slug: 'norway-constitution-day', month: 5, day: 17},
	{slug: 'towel-day', month: 5, day: 25},
	{slug: 'pride-month', month: 6, day: 1, endMonth: 6, endDay: 30},
	{slug: 'italian-republic-day', month: 6, day: 2},
	{slug: 'denmark-constitution-day', month: 6, day: 5},
	{slug: 'sweden-national-day', month: 6, day: 6},
	{slug: 'portugal-day', month: 6, day: 10},
	{slug: 'russia-day', month: 6, day: 12},
	{slug: 'iceland-national-day', month: 6, day: 17},
	{slug: 'juneteenth', month: 6, day: 19},
	{slug: 'stonewall-day', month: 6, day: 28},
	{slug: 'canada-day', month: 7, day: 1},
	{slug: 'us-independence-day', month: 7, day: 4},
	{slug: 'japan-tanabata', month: 7, day: 7},
	{slug: 'argentina-independence', month: 7, day: 9},
	{slug: 'bastille-day', month: 7, day: 14},
	{slug: 'colombia-independence', month: 7, day: 20},
	{slug: 'belgium-national-day', month: 7, day: 21},
	{slug: 'egypt-revolution-day', month: 7, day: 23},
	{slug: 'swiss-national-day', month: 8, day: 1},
	{slug: 'india-independence-day', month: 8, day: 15},
	{slug: 'korea-liberation-day', month: 8, day: 15},
	{slug: 'hungary-state-foundation', month: 8, day: 20},
	{slug: 'ukraine-independence', month: 8, day: 24},
	{slug: 'vietnam-national-day', month: 9, day: 2},
	{slug: 'brazil-independence', month: 9, day: 7},
	{slug: 'mexico-independence', month: 9, day: 16},
	{slug: 'chile-fiestas-patrias', month: 9, day: 18},
	{slug: 'talk-like-a-pirate-day', month: 9, day: 19},
	{slug: 'south-africa-heritage-day', month: 9, day: 24},
	{slug: 'czech-statehood', month: 9, day: 28},
	{slug: 'china-national-day', month: 10, day: 1},
	{slug: 'india-gandhi-jayanti', month: 10, day: 2},
	{slug: 'german-unity-day', month: 10, day: 3},
	{slug: 'korea-foundation-day', month: 10, day: 3},
	{slug: 'korea-hangul-day', month: 10, day: 9},
	{slug: 'spain-hispanic-day', month: 10, day: 12},
	{slug: 'back-to-the-future-day', month: 10, day: 21},
	{slug: 'turkey-republic-day', month: 10, day: 29},
	{slug: 'halloween', month: 10, day: 31},
	{slug: 'dia-de-los-muertos', month: 11, day: 1, endMonth: 11, endDay: 2},
	{slug: 'japan-culture-day', month: 11, day: 3},
	{slug: 'remembrance-day', month: 11, day: 11},
	{slug: 'us-veterans-day', month: 11, day: 11},
	{slug: 'finland-independence', month: 12, day: 6},
	{slug: 'human-rights-day', month: 12, day: 10},
	{slug: 'christmas-eve', month: 12, day: 24},
	{slug: 'christmas', month: 12, day: 25},
	{slug: 'christmastide', month: 12, day: 25, endMonth: 12, endDay: 26},
	{slug: 'boxing-day', month: 12, day: 26},
	{slug: 'new-years-eve', month: 12, day: 31},
];
const matches = (entry: HolidayEntry, month: number, day: number): boolean => {
	if (entry.endMonth == null || entry.endDay == null) {
		return entry.month === month && entry.day === day;
	}
	const ordinal = month * 100 + day;
	const start = entry.month * 100 + entry.day;
	const end = entry.endMonth * 100 + entry.endDay;
	if (start <= end) {
		return ordinal >= start && ordinal <= end;
	}
	return ordinal >= start || ordinal <= end;
};
export const getActiveHolidaySlugs = (date: Date): Array<string> => {
	const month = date.getMonth() + 1;
	const day = date.getDate();
	return HOLIDAYS.filter((entry) => matches(entry, month, day)).map((entry) => entry.slug);
};
export const millisecondsUntilNextLocalMidnight = (now: Date): number => {
	const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
	return Math.max(1000, next.getTime() - now.getTime());
};

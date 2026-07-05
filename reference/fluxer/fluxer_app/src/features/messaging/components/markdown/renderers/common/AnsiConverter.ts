// SPDX-License-Identifier: AGPL-3.0-or-later

// biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape parsing intentionally matches ESC and CSI bytes.
const ANSI_ESCAPE_RE = /(?:\x1b\[|\u241b\[|\u009b)([0-9;:]*)m/g;
const STANDARD_FG_COLOURS: Record<number, string> = {
	30: 'ansi-black',
	31: 'ansi-red',
	32: 'ansi-green',
	33: 'ansi-yellow',
	34: 'ansi-blue',
	35: 'ansi-magenta',
	36: 'ansi-cyan',
	37: 'ansi-white',
	90: 'ansi-bright-black',
	91: 'ansi-bright-red',
	92: 'ansi-bright-green',
	93: 'ansi-bright-yellow',
	94: 'ansi-bright-blue',
	95: 'ansi-bright-magenta',
	96: 'ansi-bright-cyan',
	97: 'ansi-bright-white',
};
const STANDARD_BG_COLOURS: Record<number, string> = {
	40: 'ansi-bg-black',
	41: 'ansi-bg-red',
	42: 'ansi-bg-green',
	43: 'ansi-bg-yellow',
	44: 'ansi-bg-blue',
	45: 'ansi-bg-magenta',
	46: 'ansi-bg-cyan',
	47: 'ansi-bg-white',
	100: 'ansi-bg-bright-black',
	101: 'ansi-bg-bright-red',
	102: 'ansi-bg-bright-green',
	103: 'ansi-bg-bright-yellow',
	104: 'ansi-bg-bright-blue',
	105: 'ansi-bg-bright-magenta',
	106: 'ansi-bg-bright-cyan',
	107: 'ansi-bg-bright-white',
};
const FOREGROUND_TO_BACKGROUND_CLASS = new Map(
	Object.entries(STANDARD_FG_COLOURS)
		.map(([code, className]) => [className, STANDARD_BG_COLOURS[Number(code) + 10] ?? null] as const)
		.filter((entry): entry is readonly [string, string] => entry[1] !== null),
);
const BACKGROUND_TO_FOREGROUND_CLASS = new Map(
	Object.entries(STANDARD_BG_COLOURS)
		.map(([code, className]) => [className, STANDARD_FG_COLOURS[Number(code) - 10] ?? null] as const)
		.filter((entry): entry is readonly [string, string] => entry[1] !== null),
);
const COLOUR_256_TABLE: ReadonlyArray<string> = buildColour256Table();

function buildColour256Table(): Array<string> {
	const table: Array<string> = [
		'#1e1e1e',
		'#f44747',
		'#6a9955',
		'#d7ba7d',
		'#569cd6',
		'#c586c0',
		'#4ec9b0',
		'#d4d4d4',
		'#808080',
		'#f44747',
		'#6a9955',
		'#d7ba7d',
		'#569cd6',
		'#c586c0',
		'#4ec9b0',
		'#ffffff',
	];
	for (let r = 0; r < 6; r++) {
		for (let g = 0; g < 6; g++) {
			for (let b = 0; b < 6; b++) {
				const rv = r === 0 ? 0 : 55 + r * 40;
				const gv = g === 0 ? 0 : 55 + g * 40;
				const bv = b === 0 ? 0 : 55 + b * 40;
				table.push(
					`#${rv.toString(16).padStart(2, '0')}${gv.toString(16).padStart(2, '0')}${bv.toString(16).padStart(2, '0')}`,
				);
			}
		}
	}
	for (let i = 0; i < 24; i++) {
		const v = 8 + i * 10;
		table.push(
			`#${v.toString(16).padStart(2, '0')}${v.toString(16).padStart(2, '0')}${v.toString(16).padStart(2, '0')}`,
		);
	}
	return table;
}

interface AnsiState {
	bold: boolean;
	blink: boolean;
	conceal: boolean;
	dim: boolean;
	doubleUnderline: boolean;
	italic: boolean;
	inverse: boolean;
	underline: boolean;
	strikethrough: boolean;
	fgClass: string | null;
	bgClass: string | null;
	fgStyle: string | null;
	bgStyle: string | null;
}

function createEmptyState(): AnsiState {
	return {
		bold: false,
		blink: false,
		conceal: false,
		dim: false,
		doubleUnderline: false,
		italic: false,
		inverse: false,
		underline: false,
		strikethrough: false,
		fgClass: null,
		bgClass: null,
		fgStyle: null,
		bgStyle: null,
	};
}

function stateIsEmpty(state: AnsiState): boolean {
	return (
		!state.bold &&
		!state.blink &&
		!state.conceal &&
		!state.dim &&
		!state.doubleUnderline &&
		!state.italic &&
		!state.inverse &&
		!state.underline &&
		!state.strikethrough &&
		state.fgClass === null &&
		state.bgClass === null &&
		state.fgStyle === null &&
		state.bgStyle === null
	);
}

function escapeHtml(text: string): string {
	return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildOpenTag(state: AnsiState): string {
	const classes: Array<string> = [];
	const styles: Array<string> = [];
	let fgClass = state.fgClass;
	let bgClass = state.bgClass;
	let fgStyle = state.fgStyle;
	let bgStyle = state.bgStyle;
	if (state.bold) classes.push('ansi-bold');
	if (state.blink) classes.push('ansi-blink');
	if (state.conceal) classes.push('ansi-conceal');
	if (state.dim) classes.push('ansi-dim');
	if (state.doubleUnderline) classes.push('ansi-double-underline');
	if (state.italic) classes.push('ansi-italic');
	if (state.inverse) classes.push('ansi-inverse');
	if (state.underline) classes.push('ansi-underline');
	if (state.strikethrough) classes.push('ansi-strikethrough');
	if (state.inverse) {
		const swappedFgClass = bgClass ? (BACKGROUND_TO_FOREGROUND_CLASS.get(bgClass) ?? null) : null;
		const swappedBgClass = fgClass ? (FOREGROUND_TO_BACKGROUND_CLASS.get(fgClass) ?? null) : null;
		const swappedFgStyle = bgStyle;
		const swappedBgStyle = fgStyle;
		fgClass = swappedFgClass;
		bgClass = swappedBgClass;
		fgStyle = swappedFgStyle ?? (swappedFgClass ? null : 'var(--bg-code-block)');
		bgStyle = swappedBgStyle ?? (swappedBgClass ? null : 'var(--text-primary)');
	}
	if (state.conceal) {
		fgClass = null;
		fgStyle = 'transparent';
	}
	if (fgClass) classes.push(fgClass);
	if (bgClass) classes.push(bgClass);
	if (fgStyle) styles.push(`color:${fgStyle}`);
	if (bgStyle) styles.push(`background-color:${bgStyle}`);
	const classAttr = classes.length > 0 ? ` class="${classes.join(' ')}"` : '';
	const styleAttr = styles.length > 0 ? ` style="${styles.join(';')}"` : '';
	return `<span${classAttr}${styleAttr}>`;
}

function parseExtendedColour(
	codes: Array<number>,
	index: number,
): {
	colour: string | null;
	consumed: number;
} {
	const mode = codes[index];
	if (mode === 5 && index + 1 < codes.length) {
		const colourIndex = codes[index + 1];
		if (colourIndex >= 0 && colourIndex < 256) {
			return {colour: COLOUR_256_TABLE[colourIndex], consumed: 2};
		}
		return {colour: null, consumed: 2};
	}
	if (mode === 2 && index + 3 < codes.length) {
		const r = Math.min(255, Math.max(0, codes[index + 1]));
		const g = Math.min(255, Math.max(0, codes[index + 2]));
		const b = Math.min(255, Math.max(0, codes[index + 3]));
		return {colour: `rgb(${r},${g},${b})`, consumed: 4};
	}
	return {colour: null, consumed: 1};
}

function applyAnsiCodes(state: AnsiState, codes: Array<number>): void {
	let i = 0;
	while (i < codes.length) {
		const code = codes[i];
		if (code === 0) {
			Object.assign(state, createEmptyState());
			i++;
			continue;
		}
		if (code === 1) {
			state.bold = true;
		} else if (code === 5 || code === 6) {
			state.blink = true;
		} else if (code === 2) {
			state.dim = true;
		} else if (code === 3) {
			state.italic = true;
		} else if (code === 4) {
			state.doubleUnderline = false;
			state.underline = true;
		} else if (code === 7) {
			state.inverse = true;
		} else if (code === 8) {
			state.conceal = true;
		} else if (code === 9) {
			state.strikethrough = true;
		} else if (code === 21) {
			state.underline = false;
			state.doubleUnderline = true;
		} else if (code === 22) {
			state.bold = false;
			state.dim = false;
		} else if (code === 23) {
			state.italic = false;
		} else if (code === 24) {
			state.doubleUnderline = false;
			state.underline = false;
		} else if (code === 25) {
			state.blink = false;
		} else if (code === 27) {
			state.inverse = false;
		} else if (code === 28) {
			state.conceal = false;
		} else if (code === 29) {
			state.strikethrough = false;
		} else if (code === 39) {
			state.fgClass = null;
			state.fgStyle = null;
		} else if (code === 49) {
			state.bgClass = null;
			state.bgStyle = null;
		} else if (STANDARD_FG_COLOURS[code]) {
			state.fgClass = STANDARD_FG_COLOURS[code];
			state.fgStyle = null;
		} else if (STANDARD_BG_COLOURS[code]) {
			state.bgClass = STANDARD_BG_COLOURS[code];
			state.bgStyle = null;
		} else if (code === 38) {
			const result = parseExtendedColour(codes, i + 1);
			if (result.colour) {
				state.fgStyle = result.colour;
				state.fgClass = null;
			}
			i += result.consumed;
		} else if (code === 48) {
			const result = parseExtendedColour(codes, i + 1);
			if (result.colour) {
				state.bgStyle = result.colour;
				state.bgClass = null;
			}
			i += result.consumed;
		}
		i++;
	}
}

export function convertAnsiToHtml(text: string): string {
	const state = createEmptyState();
	let html = '';
	let spanOpen = false;
	let lastIndex = 0;
	ANSI_ESCAPE_RE.lastIndex = 0;
	let match = ANSI_ESCAPE_RE.exec(text);
	while (match !== null) {
		const textBefore = text.slice(lastIndex, match.index);
		if (textBefore) {
			html += escapeHtml(textBefore);
		}
		if (spanOpen) {
			html += '</span>';
			spanOpen = false;
		}
		const rawCodes = match[1];
		const codes = rawCodes === '' ? [0] : rawCodes.split(/[;:]/u).filter(Boolean).map(Number);
		applyAnsiCodes(state, codes);
		if (!stateIsEmpty(state)) {
			html += buildOpenTag(state);
			spanOpen = true;
		}
		lastIndex = match.index + match[0].length;
		match = ANSI_ESCAPE_RE.exec(text);
	}
	const remaining = text.slice(lastIndex);
	if (remaining) {
		html += escapeHtml(remaining);
	}
	if (spanOpen) {
		html += '</span>';
	}
	return html;
}

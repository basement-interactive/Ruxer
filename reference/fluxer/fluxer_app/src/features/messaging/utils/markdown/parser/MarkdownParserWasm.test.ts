// SPDX-License-Identifier: AGPL-3.0-or-later

import {ParserFlags} from '@app/features/messaging/utils/markdown/parser/Enums';
import {parseMarkdownAstWithWasm} from '@app/features/messaging/utils/markdown/parser/MarkdownParserWasm';
import {describe, expect, it} from 'vitest';

describe('markdown parser wasm blockquotes', () => {
	it('preserves consecutive empty blockquote lines', () => {
		expect(parseMarkdownAstWithWasm('> \n>  \nsome text', ParserFlags.ALLOW_BLOCKQUOTES)).toEqual({
			nodes: [
				{
					type: 'Blockquote',
					children: [],
					blankLines: 2,
				},
				{
					type: 'Text',
					content: 'some text',
				},
			],
		});
	});

	it('keeps a bare greater-than line as text', () => {
		expect(parseMarkdownAstWithWasm('> \n>', ParserFlags.ALLOW_BLOCKQUOTES)).toEqual({
			nodes: [
				{
					type: 'Blockquote',
					children: [],
					blankLines: 1,
				},
				{
					type: 'Text',
					content: '>',
				},
			],
		});
	});
});

describe('markdown parser wasm headings', () => {
	it('preserves presentation-only heading lines as block headings', () => {
		expect(parseMarkdownAstWithWasm('# ‎ \n# ‎', ParserFlags.ALLOW_HEADINGS)).toEqual({
			nodes: [
				{
					type: 'Heading',
					level: 1,
					children: [{type: 'Text', content: '‎ '}],
				},
				{
					type: 'Heading',
					level: 1,
					children: [{type: 'Text', content: '‎'}],
				},
			],
		});
	});

	it('keeps ordinary whitespace-only heading syntax as text', () => {
		expect(parseMarkdownAstWithWasm('# ', ParserFlags.ALLOW_HEADINGS)).toEqual({
			nodes: [{type: 'Text', content: '# '}],
		});
	});
});

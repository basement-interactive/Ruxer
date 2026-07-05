// SPDX-License-Identifier: AGPL-3.0-or-later

import type {MarkdownContext} from '@app/features/messaging/components/markdown/renderers/RendererTypes';
import {getParserFlagsForContext} from '@app/features/messaging/utils/markdown/MarkdownParserFlags';
import type {Node} from '@app/features/messaging/utils/markdown/parser/Nodes';
import {WasmParser} from '@app/features/messaging/utils/markdown/parser/WasmParser';
import {LRUMap} from '@app/lib/list/ListLruMap';

interface ParseResult {
	nodes: Array<Node>;
}

const PARSE_CACHE_CAPACITY = 2048;
const parseCache = new LRUMap<string, ParseResult>(PARSE_CACHE_CAPACITY);

function getParseCacheKey(content: string, context: MarkdownContext): string {
	return `${context}\u0000${content}`;
}

export function parseMarkdownContent({content, context}: {content: string; context: MarkdownContext}): ParseResult {
	const cacheKey = getParseCacheKey(content, context);
	const cached = parseCache.get(cacheKey);
	if (cached !== undefined) {
		return cached;
	}
	const flags = getParserFlagsForContext(context);
	const parser = new WasmParser(content, flags);
	const result = parser.parse();
	parseCache.set(cacheKey, result);
	return result;
}

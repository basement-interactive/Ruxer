// SPDX-License-Identifier: AGPL-3.0-or-later

import {
	createRangesForSearchTerms,
	findAllTextNodes,
	isHighlightAPISupported,
} from '@app/features/messaging/utils/CSSHighlightSearch';

const CHANNEL_SEARCH_HIGHLIGHT_NAME = 'channel-search-highlight';
const SEARCH_HIGHLIGHT_SCOPE_ATTRIBUTE = 'data-search-highlight-scope';
const SEARCH_HIGHLIGHT_SCOPE_VALUE = 'message';

function getHighlightRoots(container: HTMLElement): Array<HTMLElement> {
	const nodes = Array.from(
		container.querySelectorAll(`[${SEARCH_HIGHLIGHT_SCOPE_ATTRIBUTE}="${SEARCH_HIGHLIGHT_SCOPE_VALUE}"]`),
	) as Array<HTMLElement>;
	return nodes.filter(
		(node) => !node.parentElement?.closest(`[${SEARCH_HIGHLIGHT_SCOPE_ATTRIBUTE}="${SEARCH_HIGHLIGHT_SCOPE_VALUE}"]`),
	);
}

function collectHighlightTextNodes(container: HTMLElement): Array<Text> {
	const roots = getHighlightRoots(container);
	if (roots.length === 0) {
		return [];
	}
	const textNodes: Array<Text> = [];
	for (const root of roots) {
		textNodes.push(...findAllTextNodes(root));
	}
	return textNodes;
}

export function applyChannelSearchHighlight(container: HTMLElement, searchTerms: Array<string>): void {
	if (!isHighlightAPISupported()) return;
	CSS.highlights.delete(CHANNEL_SEARCH_HIGHLIGHT_NAME);
	if (searchTerms.length === 0) return;
	const textNodes = collectHighlightTextNodes(container);
	if (textNodes.length === 0) return;
	const ranges = createRangesForSearchTerms(textNodes, searchTerms);
	if (ranges.length === 0) return;
	const highlight = new Highlight(...ranges);
	CSS.highlights.set(CHANNEL_SEARCH_HIGHLIGHT_NAME, highlight);
}

export function clearChannelSearchHighlight(): void {
	if (!isHighlightAPISupported()) return;
	CSS.highlights.delete(CHANNEL_SEARCH_HIGHLIGHT_NAME);
}

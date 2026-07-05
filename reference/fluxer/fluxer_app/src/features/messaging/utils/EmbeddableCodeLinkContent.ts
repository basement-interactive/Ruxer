// SPDX-License-Identifier: AGPL-3.0-or-later

import {MarkdownContext} from '@app/features/messaging/components/markdown/renderers/RendererTypes';
import {parseMarkdownContent} from '@app/features/messaging/utils/markdown/MarkdownParseCache';
import {NodeType} from '@app/features/messaging/utils/markdown/parser/Enums';
import type {
	ListNode,
	Node,
	TableCellNode,
	TableNode,
	TableRowNode,
} from '@app/features/messaging/utils/markdown/parser/Nodes';

const CODE_MARKER = '`';

function appendNodes(parts: Array<string>, nodes: ReadonlyArray<Node>): void {
	for (const node of nodes) {
		appendNode(parts, node);
	}
}

function appendList(parts: Array<string>, node: ListNode): void {
	for (const item of node.items) {
		appendNodes(parts, item.children);
	}
}

function appendTable(parts: Array<string>, node: TableNode): void {
	appendTableRow(parts, node.header);
	for (const row of node.rows) {
		appendTableRow(parts, row);
	}
}

function appendTableRow(parts: Array<string>, node: TableRowNode): void {
	for (const cell of node.cells) {
		appendTableCell(parts, cell);
	}
}

function appendTableCell(parts: Array<string>, node: TableCellNode): void {
	appendNodes(parts, node.children);
}

function appendNode(parts: Array<string>, node: Node): void {
	switch (node.type) {
		case NodeType.Text:
			parts.push(node.content);
			return;
		case NodeType.CodeBlock:
		case NodeType.InlineCode:
			return;
		case NodeType.Link:
			if (node.escaped) return;
			parts.push(node.url);
			if (node.text) {
				appendNode(parts, node.text);
			}
			return;
		case NodeType.Spoiler:
			parts.push('||');
			appendNodes(parts, node.children);
			parts.push('||');
			return;
		case NodeType.List:
			appendList(parts, node);
			return;
		case NodeType.Table:
			appendTable(parts, node);
			return;
		case NodeType.TableRow:
			appendTableRow(parts, node);
			return;
		case NodeType.TableCell:
			appendTableCell(parts, node);
			return;
		case NodeType.Blockquote:
		case NodeType.Strong:
		case NodeType.Emphasis:
		case NodeType.Underline:
		case NodeType.Strikethrough:
		case NodeType.Sequence:
		case NodeType.Heading:
		case NodeType.Subtext:
		case NodeType.Alert:
			appendNodes(parts, node.children);
			return;
		case NodeType.Mention:
		case NodeType.Timestamp:
		case NodeType.Emoji:
			return;
	}
}

export function extractEmbeddableCodeLinkContent(content: string | null): string | null {
	if (!content) return content;
	if (!content.includes(CODE_MARKER)) return content;
	try {
		const {nodes} = parseMarkdownContent({content, context: MarkdownContext.STANDARD_WITHOUT_JUMBO});
		const parts: Array<string> = [];
		appendNodes(parts, nodes);
		return parts.join('\n');
	} catch {
		return content;
	}
}

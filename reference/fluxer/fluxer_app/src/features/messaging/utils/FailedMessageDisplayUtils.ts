// SPDX-License-Identifier: AGPL-3.0-or-later

import {NodeType} from '@app/features/messaging/utils/markdown/parser/Enums';
import type {
	LinkNode,
	ListNode,
	Node,
	TableNode,
	TableRowNode,
	TextNode,
} from '@app/features/messaging/utils/markdown/parser/Nodes';

function nodeHasStyleableText(node: Node): boolean {
	switch (node.type) {
		case NodeType.Text:
			return (node as TextNode).content.trim().length > 0;
		case NodeType.Link: {
			const linkNode = node as LinkNode;
			return linkNode.text ? nodeHasStyleableText(linkNode.text) : linkNode.url.trim().length > 0;
		}
		case NodeType.Blockquote:
		case NodeType.Strong:
		case NodeType.Emphasis:
		case NodeType.Underline:
		case NodeType.Strikethrough:
		case NodeType.Spoiler:
		case NodeType.Heading:
		case NodeType.Subtext:
		case NodeType.Sequence:
		case NodeType.Alert:
		case NodeType.TableCell:
			return node.children.some(nodeHasStyleableText);
		case NodeType.List:
			return (node as ListNode).items.some((item) => item.children.some(nodeHasStyleableText));
		case NodeType.Table: {
			const tableNode = node as TableNode;
			return nodeHasStyleableText(tableNode.header) || tableNode.rows.some((row) => nodeHasStyleableText(row));
		}
		case NodeType.TableRow:
			return (node as TableRowNode).cells.some(nodeHasStyleableText);
		case NodeType.CodeBlock:
		case NodeType.InlineCode:
		case NodeType.Timestamp:
			return true;
		case NodeType.Mention:
		case NodeType.Emoji:
			return false;
		default:
			return false;
	}
}

export function hasStyleableMessageText(nodes: ReadonlyArray<Node>): boolean {
	return nodes.some(nodeHasStyleableText);
}

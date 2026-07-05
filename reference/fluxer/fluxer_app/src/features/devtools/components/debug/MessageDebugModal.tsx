// SPDX-License-Identifier: AGPL-3.0-or-later

import {DebugModal, type DebugTab, SummaryItem} from '@app/features/devtools/components/debug/DebugModal';
import {parse} from '@app/features/messaging/components/markdown/renderers';
import {MarkdownContext} from '@app/features/messaging/components/markdown/renderers/RendererTypes';
import type {Message} from '@app/features/messaging/models/MessagingMessage';
import type {MessageMention, Message as WireMessage} from '@fluxer/schema/src/domains/message/MessageResponseSchemas';
import type {UserPartial} from '@fluxer/schema/src/domains/user/UserResponseSchemas';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useMemo} from 'react';

const MESSAGE_RECORD_DESCRIPTOR = msg({
	message: 'Message record',
	comment: 'Developer debug modal tab showing the raw message data record.',
});
const MESSAGE_AST_DESCRIPTOR = msg({
	message: 'Message AST',
	comment: 'Developer debug modal tab showing the parsed message abstract syntax tree.',
});
const TOTAL_PARSING_TIME_DESCRIPTOR = msg({
	message: 'Total parsing time:',
	comment: 'Developer debug summary label for total message markdown parsing duration.',
});

interface MessageDebugModalProps {
	title: string;
	message: Message;
}

function toUserPartial(user: UserPartial): UserPartial {
	return {
		id: user.id,
		username: user.username,
		discriminator: user.discriminator,
		global_name: user.global_name ?? null,
		avatar: user.avatar ?? null,
		avatar_color: user.avatar_color ?? null,
		bot: user.bot,
		system: user.system,
		flags: user.flags,
	};
}

function toMessageMentionPartial(mention: MessageMention): MessageMention {
	return {
		...toUserPartial(mention),
		...(mention.member ? {member: mention.member} : {}),
	};
}

function normaliseMessageUserObjects(message: WireMessage): WireMessage {
	return {
		...message,
		author: toUserPartial(message.author),
		mentions: message.mentions?.map(toMessageMentionPartial),
		referenced_message:
			message.referenced_message == null
				? message.referenced_message
				: normaliseMessageUserObjects(message.referenced_message),
	};
}

export const MessageDebugModal: React.FC<MessageDebugModalProps> = observer(({title, message}) => {
	const {i18n} = useLingui();
	const recordJsonData = useMemo(() => normaliseMessageUserObjects(message.toJSON()), [message]);
	const astData = useMemo(() => {
		const results: Record<string, unknown> = {};
		let totalParseTime = 0;
		if (message.content) {
			const startTime = performance.now();
			const nodes = parse({
				content: message.content,
				context: MarkdownContext.STANDARD_WITH_JUMBO,
			});
			const endTime = performance.now();
			const parseTime = endTime - startTime;
			results.message_content = {
				content: message.content,
				ast: nodes,
				parseTime,
			};
			totalParseTime += parseTime;
		}
		if (message.embeds.length > 0) {
			const embedResults: Array<Record<string, unknown>> = [];
			for (const [index, embed] of message.embeds.entries()) {
				const embedResult: Record<string, unknown> = {
					embed_index: index,
					embed_type: embed.type,
				};
				if (embed.title) {
					const startTime = performance.now();
					const nodes = parse({
						content: embed.title,
						context: MarkdownContext.STANDARD_WITH_JUMBO,
					});
					const endTime = performance.now();
					const parseTime = endTime - startTime;
					embedResult.title = {
						content: embed.title,
						ast: nodes,
						parseTime,
					};
					totalParseTime += parseTime;
				}
				if (embed.description) {
					const startTime = performance.now();
					const nodes = parse({
						content: embed.description,
						context: MarkdownContext.STANDARD_WITH_JUMBO,
					});
					const endTime = performance.now();
					const parseTime = endTime - startTime;
					embedResult.description = {
						content: embed.description,
						ast: nodes,
						parseTime,
					};
					totalParseTime += parseTime;
				}
				if (embed.fields && embed.fields.length > 0) {
					const fieldResults: Array<Record<string, unknown>> = [];
					for (const [fieldIndex, field] of embed.fields.entries()) {
						const fieldResult: Record<string, unknown> = {
							field_index: fieldIndex,
							inline: field.inline,
						};
						if (field.name) {
							const startTime = performance.now();
							const nodes = parse({
								content: field.name,
								context: MarkdownContext.STANDARD_WITH_JUMBO,
							});
							const endTime = performance.now();
							const parseTime = endTime - startTime;
							fieldResult.name = {
								content: field.name,
								ast: nodes,
								parseTime,
							};
							totalParseTime += parseTime;
						}
						if (field.value) {
							const startTime = performance.now();
							const nodes = parse({
								content: field.value,
								context: MarkdownContext.STANDARD_WITH_JUMBO,
							});
							const endTime = performance.now();
							const parseTime = endTime - startTime;
							fieldResult.value = {
								content: field.value,
								ast: nodes,
								parseTime,
							};
							totalParseTime += parseTime;
						}
						fieldResults.push(fieldResult);
					}
					embedResult.fields = fieldResults;
				}
				embedResults.push(embedResult);
			}
			results.embeds = embedResults;
		}
		if (Object.keys(results).length === 0) {
			return null;
		}
		return {
			results,
			totalParseTime,
		};
	}, [message.content, message.embeds]);
	const tabs: Array<DebugTab> = [
		{
			id: 'record',
			label: i18n._(MESSAGE_RECORD_DESCRIPTOR),
			data: recordJsonData,
		},
		{
			id: 'ast',
			label: i18n._(MESSAGE_AST_DESCRIPTOR),
			data: astData?.results ?? null,
			summary: astData ? (
				<SummaryItem
					label={i18n._(TOTAL_PARSING_TIME_DESCRIPTOR)}
					value={`${astData.totalParseTime.toFixed(2)} ms`}
					data-flx="devtools.debug.message-debug-modal.summary-item"
				/>
			) : null,
		},
	];
	return <DebugModal title={title} tabs={tabs} data-flx="devtools.debug.message-debug-modal.debug-modal" />;
});

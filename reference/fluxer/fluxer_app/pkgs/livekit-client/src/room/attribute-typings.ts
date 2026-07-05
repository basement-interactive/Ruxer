// SPDX-FileCopyrightText: 2024 LiveKit, Inc.
//
// SPDX-License-Identifier: Apache-2.0
export interface AgentAttributes {
	'lk.agent.inputs'?: Array<AgentInput>;
	'lk.agent.outputs'?: Array<AgentOutput>;
	'lk.agent.state'?: AgentState;
	'lk.publish_on_behalf'?: string;
	[property: string]: unknown;
}

export type AgentInput = 'audio' | 'video' | 'text';

export type AgentOutput = 'transcription' | 'audio';

export type AgentState = 'idle' | 'initializing' | 'listening' | 'thinking' | 'speaking';

export interface TranscriptionAttributes {
	'lk.segment_id'?: string;
	'lk.transcribed_track_id'?: string;
	'lk.transcription_final'?: boolean;
	[property: string]: unknown;
}

// biome-ignore lint/complexity/noStaticOnlyClass: Generated conversion API is intentionally exposed as static helpers.
export class Convert {
	public static toAgentAttributes(json: string): AgentAttributes {
		return JSON.parse(json);
	}

	public static agentAttributesToJson(value: AgentAttributes): string {
		return JSON.stringify(value);
	}

	public static toTranscriptionAttributes(json: string): TranscriptionAttributes {
		return JSON.parse(json);
	}

	public static transcriptionAttributesToJson(value: TranscriptionAttributes): string {
		return JSON.stringify(value);
	}
}

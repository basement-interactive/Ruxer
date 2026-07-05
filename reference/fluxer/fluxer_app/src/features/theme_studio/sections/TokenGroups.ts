// SPDX-License-Identifier: AGPL-3.0-or-later

import {
	THEME_VARIABLE_NAMES,
	THEME_VARIABLES,
	type ThemeVariableDefinition,
} from '@app/features/user/components/modals/tabs/appearance_tab/theme/ThemeConstants';

export interface TokenGroupDefinition {
	id: string;
	fallbackLabel: string;
	variables: ReadonlyArray<string>;
}

const GROUP_ORDER: ReadonlyArray<string> = [
	'typography',
	'surfaces',
	'headers',
	'text',
	'brand',
	'status',
	'buttons',
	'borders',
	'alerts',
	'markup',
	'code',
	'tables',
	'messages',
	'forms',
	'layout',
	'scrolling',
	'motion',
	'layering',
	'media',
	'emoji',
	'other',
];

export const TOKEN_VARIABLES_BY_NAME: ReadonlyMap<string, ThemeVariableDefinition> = new Map(
	THEME_VARIABLES.map((definition) => [definition.name, definition]),
);

export function getTokenVariableDefinition(variableName: string): ThemeVariableDefinition | null {
	return TOKEN_VARIABLES_BY_NAME.get(variableName) ?? null;
}

function buildGroups(): ReadonlyArray<TokenGroupDefinition> {
	const variablesByGroup = new Map<string, Array<string>>();
	const labelsByGroup = new Map<string, string>();
	for (const definition of THEME_VARIABLES) {
		const groupVariables = variablesByGroup.get(definition.groupId) ?? [];
		groupVariables.push(definition.name);
		variablesByGroup.set(definition.groupId, groupVariables);
		labelsByGroup.set(definition.groupId, definition.groupLabel);
	}
	const groupIds = [
		...GROUP_ORDER.filter((groupId) => variablesByGroup.has(groupId)),
		...[...variablesByGroup.keys()].filter((groupId) => !GROUP_ORDER.includes(groupId)).sort(),
	];
	return groupIds.map((groupId) => ({
		id: groupId,
		fallbackLabel: labelsByGroup.get(groupId) ?? humanizeVariableName(groupId),
		variables: variablesByGroup.get(groupId) ?? [],
	}));
}

export const TOKEN_GROUPS: ReadonlyArray<TokenGroupDefinition> = buildGroups();
export const DEFAULT_EXPANDED_GROUP_IDS: ReadonlyArray<string> = ['surfaces', 'text', 'brand', 'messages'];

export function assertTokenGroupsCoverConstants(): void {
	const grouped = new Set<string>();
	for (const group of TOKEN_GROUPS) {
		for (const variable of group.variables) {
			if (grouped.has(variable)) {
				throw new Error(`Token Studio: variable ${variable} is assigned to more than one group`);
			}
			grouped.add(variable);
		}
	}
	const expected = new Set<string>(THEME_VARIABLE_NAMES);
	for (const variable of expected) {
		if (!grouped.has(variable)) {
			throw new Error(`Token Studio: variable ${variable} is missing from TokenGroups`);
		}
	}
	for (const variable of grouped) {
		if (!expected.has(variable)) {
			throw new Error(`Token Studio: variable ${variable} is not present in theme constants`);
		}
	}
}

if (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production') {
	try {
		assertTokenGroupsCoverConstants();
	} catch (error) {
		console.error('[ThemeStudio] TokenGroups taxonomy mismatch:', error);
	}
}

export function humanizeVariableName(variable: string): string {
	return variable.replace(/^--/, '').replace(/[-_]/g, ' ');
}

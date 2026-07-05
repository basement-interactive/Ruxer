// SPDX-License-Identifier: AGPL-3.0-or-later
import type {OpenAPIPathItem, OpenAPISchema} from '@fluxer/openapi/src/OpenAPITypes';

const OPENAPI_SCHEMA_REF_PATTERN = /#\/components\/schemas\/([A-Za-z0-9_]+)/;
export function collectReferencedSchemaNames(
	paths: Record<string, OpenAPIPathItem>,
	allSchemas: Record<string, OpenAPISchema>,
): Set<string> {
	const referenced = new Set<string>();
	function addSchema(schemaName: string): void {
		if (referenced.has(schemaName)) {
			return;
		}
		referenced.add(schemaName);
		if (allSchemas[schemaName]) {
			extractRefs(allSchemas[schemaName]);
		}
	}
	function extractRefs(value: unknown): void {
		if (value == null || typeof value !== 'object') {
			return;
		}
		if (
			'$ref' in value &&
			typeof (
				value as {
					$ref: string;
				}
			).$ref === 'string'
		) {
			const ref = (
				value as {
					$ref: string;
				}
			).$ref;
			const match = ref.match(OPENAPI_SCHEMA_REF_PATTERN);
			if (match) {
				addSchema(match[1]);
			}
		}
		if (Array.isArray(value)) {
			for (const item of value) {
				extractRefs(item);
			}
			return;
		}
		for (const nested of Object.values(value as Record<string, unknown>)) {
			extractRefs(nested);
		}
	}
	extractRefs(paths);
	addSchema('Error');
	return referenced;
}

// SPDX-License-Identifier: AGPL-3.0-or-later
import type {OpenAPIRef, OpenAPISchema} from '@fluxer/openapi/src/Types';
export class SchemaRegistry {
	private schemas: Map<string, OpenAPISchema> = new Map();
	private references: Set<string> = new Set();
	register(name: string, schema: OpenAPISchema): void {
		this.schemas.set(name, schema);
	}
	getRef(name: string): OpenAPIRef {
		this.references.add(name);
		return {$ref: `#/components/schemas/${name}`};
	}
	has(name: string): boolean {
		return this.schemas.has(name);
	}
	get(name: string): OpenAPISchema | undefined {
		return this.schemas.get(name);
	}
	getAllSchemas(): Record<string, OpenAPISchema> {
		const result: Record<string, OpenAPISchema> = {};
		for (const [name, schema] of this.schemas) {
			result[name] = schema;
		}
		return result;
	}
	getReferencedSchemas(): Record<string, OpenAPISchema> {
		const result: Record<string, OpenAPISchema> = {};
		for (const name of this.references) {
			const schema = this.schemas.get(name);
			if (schema) {
				result[name] = schema;
			}
		}
		return result;
	}
	getUnreferencedSchemas(): Array<string> {
		const unreferenced: Array<string> = [];
		for (const name of this.schemas.keys()) {
			if (!this.references.has(name)) {
				unreferenced.push(name);
			}
		}
		return unreferenced;
	}
	clear(): void {
		this.schemas.clear();
		this.references.clear();
	}
}

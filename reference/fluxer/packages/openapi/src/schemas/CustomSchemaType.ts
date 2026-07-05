// SPDX-License-Identifier: AGPL-3.0-or-later
import type {OpenAPIRef, OpenAPISchema} from '@fluxer/openapi/src/Types';
import type {ZodTypeAny} from 'zod';

const FLUXER_CUSTOM_TYPE_KEY = '__fluxer_custom_type__';
interface CustomSchemaTypeConfig<TName extends string = string> {
	readonly name: TName;
	readonly zodSchema: ZodTypeAny;
	readonly openApiSchema: OpenAPISchema;
}
const registry = new Map<string, CustomSchemaType>();
export class CustomSchemaType<TName extends string = string> {
	public readonly name: TName;
	public readonly zodSchema: ZodTypeAny;
	public readonly openApiSchema: OpenAPISchema;
	public readonly ref: OpenAPIRef;
	constructor(config: CustomSchemaTypeConfig<TName>) {
		this.name = config.name;
		this.openApiSchema = config.openApiSchema;
		this.ref = {$ref: `#/components/schemas/${config.name}`};
		this.zodSchema = markAsCustomType(config.zodSchema, config.name);
		registry.set(config.name, this);
	}
	public static get(name: string): CustomSchemaType | undefined {
		return registry.get(name);
	}
	public static getRef(name: string): OpenAPIRef | null {
		const type = registry.get(name);
		return type?.ref ?? null;
	}
	public static getAll(): ReadonlyMap<string, CustomSchemaType> {
		return registry;
	}
	public static getAllSchemas(): Record<string, OpenAPISchema> {
		const result: Record<string, OpenAPISchema> = {};
		for (const [name, type] of registry) {
			result[name] = type.openApiSchema;
		}
		return result;
	}
}
function markAsCustomType<T extends ZodTypeAny>(schema: T, typeName: string): T {
	(schema as Record<string, unknown>)[FLUXER_CUSTOM_TYPE_KEY] = typeName;
	return schema;
}

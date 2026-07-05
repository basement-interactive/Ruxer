// SPDX-License-Identifier: AGPL-3.0-or-later
import type {OpenAPIDocument} from '@fluxer/openapi/src/OpenAPITypes';

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function cloneSpec(spec: OpenAPIDocument): JsonObject {
	return JSON.parse(JSON.stringify(spec)) as JsonObject;
}

function stripNullFromMulti(items: Array<unknown>): {
	cleaned: Array<unknown>;
	hadNull: boolean;
} {
	const cleaned = items.filter((item) => !(isObject(item) && item.type === 'null'));
	return {
		cleaned,
		hadNull: cleaned.length < items.length,
	};
}

function convertOpenAPI31NullableTo30(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value.map(convertOpenAPI31NullableTo30);
	}
	if (!isObject(value)) {
		return value;
	}
	const result: JsonObject = {};
	for (const [key, item] of Object.entries(value)) {
		result[key] = convertOpenAPI31NullableTo30(item);
	}
	for (const keyword of ['anyOf', 'oneOf']) {
		const items = result[keyword];
		if (!Array.isArray(items)) {
			continue;
		}
		const {cleaned, hadNull} = stripNullFromMulti(items);
		if (!hadNull) {
			continue;
		}
		const nullableResult: JsonObject = {};
		for (const [key, item] of Object.entries(result)) {
			if (key !== keyword) {
				nullableResult[key] = item;
			}
		}
		nullableResult.nullable = true;
		if (cleaned.length === 1) {
			const other = cleaned[0];
			if (isObject(other) && typeof other.$ref === 'string') {
				nullableResult.allOf = [other];
			} else if (isObject(other)) {
				for (const [key, item] of Object.entries(other)) {
					nullableResult[key] = item;
				}
			} else {
				nullableResult[keyword] = cleaned;
			}
		} else {
			nullableResult[keyword] = cleaned;
		}
		return nullableResult;
	}
	return result;
}

function convertExclusiveBounds(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value.map(convertExclusiveBounds);
	}
	if (!isObject(value)) {
		return value;
	}
	const result: JsonObject = {};
	for (const [key, item] of Object.entries(value)) {
		result[key] = convertExclusiveBounds(item);
	}
	if (typeof result.exclusiveMinimum === 'number') {
		const minimum = result.exclusiveMinimum;
		delete result.exclusiveMinimum;
		result.minimum = minimum;
		result.exclusiveMinimum = true;
	}
	if (typeof result.exclusiveMaximum === 'number') {
		const maximum = result.exclusiveMaximum;
		delete result.exclusiveMaximum;
		result.maximum = maximum;
		result.exclusiveMaximum = true;
	}
	return result;
}

function stripXExtensions(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value.map(stripXExtensions);
	}
	if (!isObject(value)) {
		return value;
	}
	const result: JsonObject = {};
	for (const [key, item] of Object.entries(value)) {
		if (!key.startsWith('x-')) {
			result[key] = stripXExtensions(item);
		}
	}
	return result;
}

function normalizeRateLimitResponses(spec: JsonObject): void {
	const paths = spec.paths;
	if (!isObject(paths)) {
		return;
	}
	for (const pathItem of Object.values(paths)) {
		if (!isObject(pathItem)) {
			continue;
		}
		for (const methodValue of Object.values(pathItem)) {
			if (!isObject(methodValue)) {
				continue;
			}
			const responses = methodValue.responses;
			if (!isObject(responses)) {
				continue;
			}
			const rateLimitResponse = responses['429'];
			if (!isObject(rateLimitResponse)) {
				continue;
			}
			rateLimitResponse.content = {
				'application/json': {
					schema: {$ref: '#/components/schemas/Error'},
				},
			};
		}
	}
}

function normalizeMultipartRequestBodies(spec: JsonObject): void {
	const paths = spec.paths;
	if (!isObject(paths)) {
		return;
	}
	for (const pathItem of Object.values(paths)) {
		if (!isObject(pathItem)) {
			continue;
		}
		for (const methodValue of Object.values(pathItem)) {
			if (!isObject(methodValue)) {
				continue;
			}
			const requestBody = methodValue.requestBody;
			if (!isObject(requestBody)) {
				continue;
			}
			const content = requestBody.content;
			if (!isObject(content) || !('multipart/form-data' in content) || 'application/json' in content) {
				continue;
			}
			content['application/json'] = content['multipart/form-data'];
			delete content['multipart/form-data'];
		}
	}
}

export function transformAdminOpenAPISpec(spec: OpenAPIDocument): JsonObject {
	const adminSpec = cloneSpec(spec);
	adminSpec.openapi = '3.0.3';
	normalizeRateLimitResponses(adminSpec);
	normalizeMultipartRequestBodies(adminSpec);
	return stripXExtensions(convertExclusiveBounds(convertOpenAPI31NullableTo30(adminSpec))) as JsonObject;
}

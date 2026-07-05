// SPDX-License-Identifier: AGPL-3.0-or-later
import type {OpenAPIDocument} from '@fluxer/openapi/src/Types';

type ValidatableOpenAPISpec =
	| OpenAPIDocument
	| {
			openapi?: unknown;
			info?: {
				title?: unknown;
				version?: unknown;
			};
			paths?: Record<string, unknown>;
			components?: {
				schemas?: Record<string, unknown>;
			};
	  };
interface ValidationResult {
	valid: boolean;
	errors: Array<ValidationError>;
	warnings: Array<ValidationWarning>;
}
interface ValidationError {
	path: string;
	message: string;
}
interface ValidationWarning {
	path: string;
	message: string;
}
interface SpecValidationOptions {
	readonly allowedOpenAPIVersions?: ReadonlyArray<string>;
}
function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export function validateSpec(spec: ValidatableOpenAPISpec, options?: SpecValidationOptions): ValidationResult {
	const errors: Array<ValidationError> = [];
	const warnings: Array<ValidationWarning> = [];
	const allowedVersions = options?.allowedOpenAPIVersions ?? ['3.1.0'];
	if (typeof spec.openapi !== 'string' || !allowedVersions.includes(spec.openapi)) {
		errors.push({path: 'openapi', message: `Expected ${allowedVersions.join(' or ')}, got "${spec.openapi}"`});
	}
	if (!spec.info?.title) {
		errors.push({path: 'info.title', message: 'Missing required field'});
	}
	if (!spec.info?.version) {
		errors.push({path: 'info.version', message: 'Missing required field'});
	}
	if (!spec.paths || Object.keys(spec.paths).length === 0) {
		warnings.push({path: 'paths', message: 'No paths defined'});
	}
	validateRefs(spec, errors);
	validateOperationIds(spec, errors);
	validatePaths(spec, errors, warnings);
	return {
		valid: errors.length === 0,
		errors,
		warnings,
	};
}
function validateRefs(spec: ValidatableOpenAPISpec, errors: Array<ValidationError>): void {
	const definedSchemas = new Set(Object.keys(spec.components?.schemas ?? {}));
	const checkRefs = (obj: unknown, path: string): void => {
		if (Array.isArray(obj)) {
			obj.forEach((item, index) => checkRefs(item, `${path}[${index}]`));
			return;
		}
		if (!isRecord(obj)) {
			return;
		}
		if ('$ref' in obj && typeof obj.$ref === 'string') {
			const ref = obj.$ref;
			if (ref.startsWith('#/components/schemas/')) {
				const schemaName = ref.replace('#/components/schemas/', '');
				if (!definedSchemas.has(schemaName)) {
					errors.push({path, message: `Reference to undefined schema: ${schemaName}`});
				}
			}
		}
		for (const [key, value] of Object.entries(obj)) {
			checkRefs(value, `${path}.${key}`);
		}
	};
	checkRefs(spec, 'spec');
}
function validateOperationIds(spec: ValidatableOpenAPISpec, errors: Array<ValidationError>): void {
	const operationIds = new Set<string>();
	for (const [pathKey, pathItem] of Object.entries(spec.paths ?? {})) {
		if (!isRecord(pathItem)) {
			continue;
		}
		for (const [method, operation] of Object.entries(pathItem)) {
			if (isRecord(operation) && 'operationId' in operation) {
				const op = operation as {
					operationId?: string;
				};
				if (op.operationId) {
					if (operationIds.has(op.operationId)) {
						errors.push({
							path: `paths.${pathKey}.${method}.operationId`,
							message: `Duplicate operationId: ${op.operationId}`,
						});
					} else {
						operationIds.add(op.operationId);
					}
				}
			}
		}
	}
}
function validatePaths(
	spec: ValidatableOpenAPISpec,
	errors: Array<ValidationError>,
	warnings: Array<ValidationWarning>,
): void {
	for (const [pathKey, pathItem] of Object.entries(spec.paths ?? {})) {
		if (!pathKey.startsWith('/')) {
			errors.push({path: `paths.${pathKey}`, message: 'Path must start with /'});
		}
		const pathParams = pathKey.match(/\{(\w+)\}/g)?.map((p) => p.slice(1, -1)) ?? [];
		if (!isRecord(pathItem)) {
			continue;
		}
		for (const [method, operation] of Object.entries(pathItem)) {
			if (!isRecord(operation)) {
				continue;
			}
			const op = operation as {
				operationId?: string;
				responses?: Record<string, unknown>;
				parameters?: Array<{
					name: string;
					in: string;
				}>;
			};
			if (!op.operationId) {
				warnings.push({
					path: `paths.${pathKey}.${method}`,
					message: 'Missing operationId',
				});
			}
			if (!op.responses || Object.keys(op.responses).length === 0) {
				errors.push({
					path: `paths.${pathKey}.${method}.responses`,
					message: 'At least one response is required',
				});
			}
			const definedParams = new Set(op.parameters?.filter((p) => p.in === 'path').map((p) => p.name) ?? []);
			for (const param of pathParams) {
				if (!definedParams.has(param)) {
					warnings.push({
						path: `paths.${pathKey}.${method}`,
						message: `Path parameter "${param}" not defined in parameters`,
					});
				}
			}
		}
	}
}
export function printValidationResult(result: ValidationResult): void {
	if (result.valid) {
		console.log('Validation passed');
	} else {
		console.log('Validation failed');
	}
	if (result.errors.length > 0) {
		console.log('\nErrors:');
		for (const error of result.errors) {
			console.log(`  - [${error.path}] ${error.message}`);
		}
	}
	if (result.warnings.length > 0) {
		console.log('\nWarnings:');
		for (const warning of result.warnings) {
			console.log(`  - [${warning.path}] ${warning.message}`);
		}
	}
}

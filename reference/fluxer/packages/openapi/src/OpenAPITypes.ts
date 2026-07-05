// SPDX-License-Identifier: AGPL-3.0-or-later
export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';
export type ValidatorTarget = 'json' | 'query' | 'param' | 'form' | 'header' | 'cookie';
export interface ExtractedValidator {
	target: ValidatorTarget;
	schemaName: string | null;
	inlineSchema: string | null;
}
export interface ExtractedRoute {
	method: HttpMethod;
	path: string;
	controllerFile: string;
	lineNumber: number;
	validators: Array<ExtractedValidator>;
	middlewares: Array<string>;
	hasLoginRequired: boolean;
	hasDefaultUserOnly: boolean;
	hasLoginRequiredAllowSuspicious: boolean;
	hasSudoMode: boolean;
	rateLimitConfig: string | null;
	handlerSource: string | null;
	responseMapperName: string | null;
	responseSchemaName: string | null;
	hasNoContent: boolean;
	successStatusCodes: Array<number>;
	explicitRequestSchemaName: string | null;
	explicitRequestFormSchemaName: string | null;
	explicitSummary: string | null;
	explicitOperationId: string | null;
	explicitDescription: string | null;
	explicitStatusCodes: Array<number> | null;
	explicitSecurity: Array<string> | null;
	oauth2RequiredScopes: Array<string> | null;
	oauth2ScopeMode: 'all' | 'any' | null;
	oauth2BearerTokenRequired: boolean;
	explicitTags: Array<string> | null;
	explicitDeprecated: boolean;
	explicitExternalDocs: {
		url: string;
		description?: string;
	} | null;
}
export interface OpenAPIPathItem {
	[method: string]: OpenAPIOperation;
}
interface MintlifyMetadata {
	title?: string;
	description?: string;
}
export interface MintlifyExtension {
	metadata?: MintlifyMetadata;
}
export interface OpenAPIOperation {
	operationId: string;
	tags: Array<string>;
	summary?: string;
	description?: string;
	security?: Array<Record<string, Array<string>>>;
	parameters?: Array<OpenAPIParameter>;
	requestBody?: OpenAPIRequestBody;
	responses: Record<string, OpenAPIResponse>;
	deprecated?: boolean;
	externalDocs?: {
		url: string;
		description?: string;
	};
	'x-mint'?: MintlifyExtension;
}
export interface OpenAPIParameter {
	name: string;
	in: 'path' | 'query' | 'header' | 'cookie';
	required: boolean;
	schema: OpenAPISchemaOrRef;
	description?: string;
}
export interface OpenAPIRequestBody {
	required?: boolean;
	content: {
		'application/json'?: {
			schema: OpenAPISchema | OpenAPIRef;
		};
		'multipart/form-data'?: {
			schema: OpenAPISchema | OpenAPIRef;
		};
	};
}
export interface OpenAPIResponse {
	description: string;
	content?: {
		'application/json'?: {
			schema: OpenAPISchema | OpenAPIRef;
		};
	};
	headers?: Record<string, OpenAPIHeaderObject>;
}
export interface OpenAPIHeaderObject {
	description?: string;
	schema: OpenAPISchemaOrRef;
}
export interface OpenAPIRef {
	$ref: string;
}
export type OpenAPISchemaOrRef = OpenAPISchema | OpenAPIRef;
export interface OpenAPISchema {
	type?: string;
	format?: string;
	items?: OpenAPISchemaOrRef | boolean;
	prefixItems?: Array<OpenAPISchemaOrRef>;
	properties?: Record<string, OpenAPISchemaOrRef>;
	additionalProperties?: boolean | OpenAPISchemaOrRef;
	required?: Array<string>;
	enum?: Array<string | number | boolean>;
	minimum?: number;
	maximum?: number;
	minLength?: number;
	maxLength?: number;
	minItems?: number;
	maxItems?: number;
	uniqueItems?: boolean;
	multipleOf?: number;
	exclusiveMinimum?: number;
	exclusiveMaximum?: number;
	pattern?: string;
	default?: unknown;
	nullable?: boolean;
	oneOf?: Array<OpenAPISchemaOrRef>;
	anyOf?: Array<OpenAPISchemaOrRef>;
	allOf?: Array<OpenAPISchemaOrRef>;
	not?: OpenAPISchemaOrRef;
	description?: string;
	discriminator?: {
		propertyName: string;
		mapping?: Record<string, string>;
	};
	patternProperties?: Record<string, OpenAPISchemaOrRef | boolean>;
}
export interface OpenAPIDocument {
	openapi: '3.1.0';
	info: {
		title: string;
		version: string;
		description?: string;
		contact?: {
			name?: string;
			email?: string;
			url?: string;
		};
		license?: {
			name: string;
			url?: string;
		};
	};
	servers?: Array<{
		url: string;
		description?: string;
	}>;
	paths: Record<string, OpenAPIPathItem>;
	components: {
		schemas: Record<string, OpenAPISchema>;
		securitySchemes: Record<string, OpenAPISecurityScheme>;
	};
	tags?: Array<{
		name: string;
		description?: string;
	}>;
}
export interface OpenAPISecurityScheme {
	type: 'http' | 'apiKey' | 'oauth2' | 'openIdConnect';
	scheme?: string;
	bearerFormat?: string;
	name?: string;
	in?: 'header' | 'query' | 'cookie';
	description?: string;
	flows?: {
		authorizationCode?: {
			authorizationUrl: string;
			tokenUrl: string;
			refreshUrl?: string;
			scopes: Record<string, string>;
		};
		clientCredentials?: {
			tokenUrl: string;
			scopes: Record<string, string>;
		};
	};
}

// SPDX-License-Identifier: AGPL-3.0-or-later
import type {OpenAPIDocument} from '@fluxer/openapi/src/OpenAPITypes';
export type OpenAPIRouteScope = 'all' | 'admin' | 'public';
export interface OpenAPIGeneratorOptions {
	readonly basePath: string;
	readonly title?: string;
	readonly version?: string;
	readonly description?: string;
	readonly serverUrl?: string;
	readonly routeScope?: OpenAPIRouteScope;
}
export interface OpenAPIGenerationStats {
	readonly controllerCount: number;
	readonly routeCount: number;
	readonly operationCount: number;
	readonly skippedRouteCount: number;
	readonly registeredSchemaCount: number;
	readonly publishedSchemaCount: number;
	readonly tagCount: number;
}
export interface OpenAPIGenerationResult {
	readonly document: OpenAPIDocument;
	readonly stats: OpenAPIGenerationStats;
}

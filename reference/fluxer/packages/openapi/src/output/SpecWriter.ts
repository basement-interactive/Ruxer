// SPDX-License-Identifier: AGPL-3.0-or-later
import * as fs from 'node:fs';
import * as path from 'node:path';
import type {OpenAPIDocument} from '@fluxer/openapi/src/Types';
import prettier from 'prettier';
export type WritableOpenAPISpec = OpenAPIDocument | Record<string, unknown>;
async function formatSpec(spec: WritableOpenAPISpec, outputPath?: string): Promise<string> {
	const prettierConfig = outputPath ? await prettier.resolveConfig(outputPath) : null;
	return prettier.format(JSON.stringify(spec), {
		...prettierConfig,
		filepath: outputPath,
		parser: 'json',
	});
}
export async function writeSpec(spec: WritableOpenAPISpec, outputPath: string): Promise<void> {
	const dir = path.dirname(outputPath);
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, {recursive: true});
	}
	const tempPath = `${outputPath}.tmp`;
	fs.writeFileSync(tempPath, await formatSpec(spec, outputPath), 'utf-8');
	fs.renameSync(tempPath, outputPath);
}
export function readSpec(inputPath: string): OpenAPIDocument {
	const content = fs.readFileSync(inputPath, 'utf-8');
	return JSON.parse(content) as OpenAPIDocument;
}
export function getApiPackageOutputPath(basePath: string): string {
	return path.join(basePath, 'fluxer_api', 'src', 'api', 'openapi', 'openapi.json');
}
export function getAdminOutputPath(basePath: string): string {
	return path.join(basePath, 'fluxer_admin', 'openapi-admin.json');
}

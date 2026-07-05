// SPDX-License-Identifier: AGPL-3.0-or-later

import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {parse as parseYaml} from 'yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../..');
const GENERATED_HEADER = '// SPDX-License-Identifier: AGPL-3.0-or-later\n\n';

interface PackageConfig {
	name: string;
	localesPath: string;
	outputFile: string;
	isEmail?: boolean;
	staticMessagesModule?: string;
	staticMessagesExport?: string;
}

const PACKAGES: Array<PackageConfig> = [
	{
		name: '@pkgs/email',
		localesPath: path.join(REPO_ROOT, 'fluxer_api/pkgs/email/src/email_i18n/locales'),
		outputFile: path.join(REPO_ROOT, 'fluxer_api/pkgs/email/src/email_i18n/EmailI18nTypes.generated.ts'),
		isEmail: true,
		staticMessagesModule: path.join(REPO_ROOT, 'fluxer_api/pkgs/email/src/email_i18n/EmailI18nMessages.ts'),
		staticMessagesExport: 'EMAIL_I18N_MESSAGES',
	},
];

function extractKeysFromYaml(filePath: string, isEmail = false): Array<string> {
	const raw = fs.readFileSync(filePath, 'utf8');
	const parsed = parseYaml(raw) as Record<string, unknown>;
	if (isEmail) {
		const emailTemplates = parsed as Record<string, {subject: string; body: string}>;
		return Object.keys(emailTemplates).sort();
	}
	return Object.keys(parsed).sort();
}

async function extractKeysFromStaticMessages(filePath: string, exportName: string): Promise<Array<string>> {
	const module = await import(pathToFileURL(filePath).href);
	const messages = module[exportName];
	if (!messages || typeof messages !== 'object' || Array.isArray(messages)) {
		throw new Error(`static messages export not found: ${exportName}`);
	}
	return Object.keys(messages).sort();
}

function generateEmailI18nTypes(keys: Array<string>): string {
	const unionType = keys.map((key) => `\t| '${key}'`).join('\n');
	return `export type EmailTemplateKey =
${unionType};

export interface EmailTemplate {
	subject: string;
	body: string;
}
`;
}

async function generatePackageTypes(config: PackageConfig): Promise<void> {
	const messagesFile = path.join(config.localesPath, 'messages.yaml');
	if (!config.staticMessagesModule && !fs.existsSync(messagesFile)) {
		console.error(`messages file not found: ${messagesFile}`);
		process.exit(1);
	}
	const keys =
		config.staticMessagesModule && config.staticMessagesExport
			? await extractKeysFromStaticMessages(config.staticMessagesModule, config.staticMessagesExport)
			: extractKeysFromYaml(messagesFile, config.isEmail);
	let content: string;
	if (config.name === '@pkgs/email') {
		content = generateEmailI18nTypes(keys);
	} else {
		throw new Error(`unknown package: ${config.name}`);
	}
	const outputDir = path.dirname(config.outputFile);
	if (!fs.existsSync(outputDir)) {
		fs.mkdirSync(outputDir, {recursive: true});
	}
	fs.writeFileSync(config.outputFile, `${GENERATED_HEADER}${content}`, 'utf8');
	console.log(`generated types for ${config.name} (${keys.length} keys) -> ${config.outputFile}`);
}

async function main(): Promise<void> {
	console.log('generating i18n types...\n');
	for (const config of PACKAGES) {
		await generatePackageTypes(config);
	}
	console.log('\nall i18n types generated successfully!');
}

await main();

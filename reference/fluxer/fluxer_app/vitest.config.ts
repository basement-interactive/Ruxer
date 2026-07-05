// SPDX-License-Identifier: AGPL-3.0-or-later

import path from 'node:path';
import {fileURLToPath} from 'node:url';
import tsconfigPaths from 'vite-tsconfig-paths';
import {defineConfig} from 'vitest/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	plugins: [
		tsconfigPaths({
			root: path.resolve(__dirname, '..'),
			skip: (dir) => path.basename(dir) === '.claude',
		}),
	],
	esbuild: {
		jsx: 'automatic',
		jsxImportSource: 'react',
	},
	test: {
		globals: true,
		environment: 'node',
		include: ['src/**/*.{test,spec}.{ts,tsx}'],
		exclude: ['node_modules', 'dist', '../.claude/**'],
		server: {
			deps: {
				inline: [/livekit-client/, /@livekit\//],
			},
		},
	},
});

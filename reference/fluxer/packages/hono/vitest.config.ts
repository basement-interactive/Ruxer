// SPDX-License-Identifier: AGPL-3.0-or-later

import tsconfigPaths from 'vite-tsconfig-paths';
import {defineConfig} from 'vitest/config';

export default defineConfig({
	root: process.cwd(),
	plugins: [tsconfigPaths()],
	cacheDir: './node_modules/.vitest',
	test: {
		globals: true,
		environment: 'node',
		pool: 'threads',
		fileParallelism: true,
		maxConcurrency: 4,
		testTimeout: 10000,
		hookTimeout: 5000,
		isolate: false,
		reporters: ['default', 'json'],
		outputFile: './test-results.json',
		coverage: {
			provider: 'v8',
			reporter: ['text', 'text-summary', 'json', 'html'],
			reportsDirectory: './coverage',
			exclude: ['**/node_modules/tests/test*.test.tsx', '**/*.test.ts'],
		},
	},
});

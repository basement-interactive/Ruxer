// SPDX-License-Identifier: AGPL-3.0-or-later

import * as v from 'valibot';

const buildInfoSchema = v.object({
	PUBLIC_BUILD_VERSION: v.nullish(v.string(), 'dev'),
});
const buildInfo = v.parse(buildInfoSchema, {
	PUBLIC_BUILD_VERSION: import.meta.env.PUBLIC_BUILD_VERSION,
});
const bootstrap = typeof window !== 'undefined' ? window.__FLUXER_BOOTSTRAP__ : undefined;

if (!bootstrap) {
	throw new Error('window.__FLUXER_BOOTSTRAP__ is missing — app must be served by fluxer_app_proxy');
}

const runtime = bootstrap.config;

export default {
	PUBLIC_BUILD_VERSION: buildInfo.PUBLIC_BUILD_VERSION,
	PUBLIC_RELEASE_CHANNEL: runtime.releaseChannel,
	PUBLIC_BOOTSTRAP_API_ENDPOINT: runtime.bootstrapApiEndpoint,
	PUBLIC_BOOTSTRAP_API_PUBLIC_ENDPOINT: runtime.bootstrapApiPublicEndpoint ?? runtime.bootstrapApiEndpoint,
};

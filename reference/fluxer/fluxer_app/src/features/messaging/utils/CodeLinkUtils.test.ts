// SPDX-License-Identifier: AGPL-3.0-or-later

import {type CodeLinkConfig, findCodes, findSpoileredCodeMatches} from '@app/features/messaging/utils/CodeLinkUtils';
import {describe, expect, it} from 'vitest';

const INVITE_CONFIG: CodeLinkConfig = {
	path: 'invite',
	urlBases: ['https://fluxer.app/invite', 'https://fluxer.gg', 'https://fluxer.gg/invite'],
};

describe('CodeLinkUtils', () => {
	it('finds spoilered code-link matches with the same URL rules as code extraction', () => {
		const content = [
			'https://fluxer.app/invite/visible',
			'||https://fluxer.app/invite/secret||',
			'||fluxer.gg/short||',
			'||https://fluxer.gg/invite/pathlink||',
			'||https://fluxer.app/invite/secret https://fluxer.gg/secret||',
			'||<https://fluxer.app/invite/suppressed>||',
		].join(' ');
		expect(findCodes(content, INVITE_CONFIG)).toEqual(['visible', 'secret', 'short', 'pathlink']);
		expect(findSpoileredCodeMatches(content, INVITE_CONFIG).map((match) => match.code)).toEqual([
			'secret',
			'short',
			'pathlink',
			'secret',
			'secret',
		]);
	});
});

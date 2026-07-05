// SPDX-License-Identifier: AGPL-3.0-or-later

import type {CodecPreference} from '@app/features/voice/utils/CodecCapabilityDetector';
import {getVideoDecoderExclusionsSync} from '@app/features/voice/utils/VideoDecoderCapabilities';
import {type VoiceEngineV2VideoCodec, voiceEngineV2VideoCodecRank} from '@fluxer/voice_engine_v2';

const ALL_VIDEO_CODECS: ReadonlyArray<VoiceEngineV2VideoCodec> = ['av1', 'h265', 'vp9', 'h264', 'vp8'];
const BASELINE_VIDEO_CODECS: ReadonlyArray<VoiceEngineV2VideoCodec> = ['h264', 'vp8'];

function trueDecodableVideoCodecs(): Array<VoiceEngineV2VideoCodec> {
	const exclusions = getVideoDecoderExclusionsSync();
	if (exclusions === null) return [...BASELINE_VIDEO_CODECS];
	const excluded = new Set<string>(exclusions);
	return ALL_VIDEO_CODECS.filter((codec) => !excluded.has(codec));
}

export function capVoiceEngineV2DecodableVideoCodecs(
	base: ReadonlyArray<VoiceEngineV2VideoCodec>,
	cap: CodecPreference,
): Array<VoiceEngineV2VideoCodec> {
	if (cap === 'auto') return [...base];
	const capRank = voiceEngineV2VideoCodecRank(cap);
	return base.filter((codec) => voiceEngineV2VideoCodecRank(codec) >= capRank);
}

export function getLocalDecodableVideoCodecs(cap: CodecPreference): Array<VoiceEngineV2VideoCodec> {
	return capVoiceEngineV2DecodableVideoCodecs(trueDecodableVideoCodecs(), cap);
}

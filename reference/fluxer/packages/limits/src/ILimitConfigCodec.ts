// SPDX-License-Identifier: AGPL-3.0-or-later

import type {LimitKey} from '@fluxer/constants/src/LimitConfigMetadata';
import type {LimitConfigSnapshot, LimitConfigWireFormat} from '@fluxer/limits/src/LimitTypes';

export interface LimitConfigCodecOptions {
	defaults?: Record<LimitKey, number>;
	defaultsHash?: string;
}

export interface ILimitConfigCodec {
	computeOverrides(
		fullLimits: Partial<Record<LimitKey, number>>,
		defaults: Record<LimitKey, number>,
	): Partial<Record<LimitKey, number>>;
	toWireFormat(config: LimitConfigSnapshot, options?: LimitConfigCodecOptions): LimitConfigWireFormat;
	fromWireFormat(wireFormat: LimitConfigWireFormat, options?: LimitConfigCodecOptions): LimitConfigSnapshot;
}

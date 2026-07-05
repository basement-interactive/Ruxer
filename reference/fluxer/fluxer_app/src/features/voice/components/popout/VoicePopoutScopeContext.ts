// SPDX-License-Identifier: AGPL-3.0-or-later

import {createContext} from 'react';

export type VoicePopoutScope = 'tile' | 'call' | null;

export const VoicePopoutScopeContext = createContext<VoicePopoutScope>(null);

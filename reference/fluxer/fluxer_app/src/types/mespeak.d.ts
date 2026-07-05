// SPDX-License-Identifier: AGPL-3.0-or-later

declare module 'mespeak' {
	interface MeSpeakSpeakOptions {
		rawdata?: boolean | 'array' | 'base64' | 'buffer' | 'data-url' | 'mime';
		voice?: string;
		variant?: string;
		amplitude?: number;
		pitch?: number;
		speed?: number;
		wordgap?: number;
		volume?: number;
	}
	interface MeSpeak {
		loadConfig(config: unknown): void;
		loadVoice(voice: unknown, callback?: (success: boolean, id: string) => void): void;
		setDefaultVoice(voiceId: string): void;
		getDefaultVoice(): string;
		isConfigLoaded(): boolean;
		isVoiceLoaded(voiceId: string): boolean;
		speak(text: string, options?: MeSpeakSpeakOptions): ArrayBuffer | number | null;
	}
	const meSpeak: MeSpeak;
	export default meSpeak;
}

declare module 'mespeak/src/mespeak_config.json' {
	const config: unknown;
	export default config;
}

declare module 'mespeak/voices/*' {
	const voice: unknown;
	export default voice;
}

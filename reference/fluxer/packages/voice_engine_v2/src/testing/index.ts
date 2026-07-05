// SPDX-License-Identifier: AGPL-3.0-or-later

export type {VoiceEngineV2ConformanceSubject, VoiceEngineV2ConformanceSubjectFactory} from './conformance';
export {runVoiceEngineV2ConformanceSuite, waitForRuntime} from './conformance';
export type {
	VoiceEngineV2EventLogFixture,
	VoiceEngineV2EventLogFixtureExpected,
	VoiceEngineV2EventLogFixtureStep,
	VoiceEngineV2EventLogReplayResult,
	VoiceEngineV2EventLogReplayStepResult,
} from './eventLogReplay';
export {
	assertVoiceEngineV2EventLogFixture,
	replayVoiceEngineV2EventLogFixture,
	VOICE_ENGINE_V2_EVENT_LOG_FIXTURE_VERSION,
} from './eventLogReplay';
export type {
	FakeVoiceEngineV2DriverCall,
	FakeVoiceEngineV2DriverCallType,
	FakeVoiceEngineV2DriverOptions,
	FakeVoiceEngineV2FailureMap,
} from './FakeVoiceEngineV2Driver';
export {FakeVoiceEngineV2Driver} from './FakeVoiceEngineV2Driver';
export type {VoiceEngineV2TestDriver} from './VoiceEngineV2TestImplementation';
export {VoiceEngineV2TestImplementation} from './VoiceEngineV2TestImplementation';

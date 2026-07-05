// SPDX-FileCopyrightText: 2024 LiveKit, Inc.
//
// SPDX-License-Identifier: Apache-2.0
import {Encryption_Type, type TrackInfo} from '@livekit/protocol';
import {EventEmitter} from 'events';
import type TypedEventEmitter from 'typed-emitter';
import log, {type LogLevel, workerLogger} from '../logger.ts';
import {DeviceUnsupportedError} from '../room/errors.ts';
import {EngineEvent, ParticipantEvent, RoomEvent} from '../room/events.ts';
import type Room from '../room/Room.ts';
import {ConnectionState} from '../room/Room.ts';
import type RTCEngine from '../room/RTCEngine.ts';
import type {VideoCodec} from '../room/track/options.ts';
import type RemoteTrack from '../room/track/RemoteTrack.ts';
import type {Track} from '../room/track/Track.ts';
import {mimeTypeToVideoCodecString} from '../room/track/utils.ts';
import {Future, isChromiumBased, isLocalTrack, isSafariBased, isVideoTrack} from '../room/utils.ts';
import {E2EE_FLAG} from './constants.ts';
import {type E2EEManagerCallbacks, EncryptionEvent, KeyProviderEvent} from './events.ts';
import type {BaseKeyProvider} from './KeyProvider.ts';
import type {
	DecryptDataRequestMessage,
	DecryptDataResponseMessage,
	E2EEManagerOptions,
	E2EEWorkerMessage,
	EnableMessage,
	EncodeMessage,
	EncryptDataRequestMessage,
	EncryptDataResponseMessage,
	InitMessage,
	KeyInfo,
	RatchetRequestMessage,
	RemoveTransformMessage,
	RTPVideoMapMessage,
	ScriptTransformOptions,
	SetKeyMessage,
	SifTrailerMessage,
	UpdateCodecMessage,
	UpdateTrackContextMessage,
} from './types.ts';
import {isE2EESupported, isScriptTransformSupported} from './utils.ts';

export interface BaseE2EEManager {
	setup(room: Room): void;
	setupEngine(engine: RTCEngine): void;
	isEnabled: boolean;
	isDataChannelEncryptionEnabled: boolean;
	setParticipantCryptorEnabled(enabled: boolean, participantIdentity: string): void;
	setSifTrailer(trailer: Uint8Array): void;
	encryptData(data: Uint8Array): Promise<EncryptDataResponseMessage['data']>;
	handleEncryptedData(
		payload: Uint8Array,
		iv: Uint8Array,
		participantIdentity: string,
		keyIndex: number,
	): Promise<DecryptDataResponseMessage['data']>;
	on<E extends keyof E2EEManagerCallbacks>(event: E, listener: E2EEManagerCallbacks[E]): this;
}

type E2EETransformState = {
	participantIdentity: string;
	trackId: string;
};

export class E2EEManager
	extends (EventEmitter as new () => TypedEventEmitter<E2EEManagerCallbacks>)
	implements BaseE2EEManager
{
	protected worker: Worker;

	protected room?: Room;

	private encryptionEnabled: boolean;

	private keyProvider: BaseKeyProvider;

	private decryptDataRequests: Map<string, Future<DecryptDataResponseMessage['data'], Error>> = new Map();

	private encryptDataRequests: Map<string, Future<EncryptDataResponseMessage['data'], Error>> = new Map();

	private dataChannelEncryptionEnabled: boolean;

	constructor(options: E2EEManagerOptions, dcEncryptionEnabled: boolean) {
		super();
		this.keyProvider = options.keyProvider;
		this.worker = options.worker;
		this.encryptionEnabled = false;
		this.dataChannelEncryptionEnabled = dcEncryptionEnabled;
	}

	get isEnabled(): boolean {
		return this.encryptionEnabled;
	}

	get isDataChannelEncryptionEnabled(): boolean {
		return this.isEnabled && this.dataChannelEncryptionEnabled;
	}

	setup(room: Room) {
		if (!isE2EESupported()) {
			throw new DeviceUnsupportedError('tried to setup end-to-end encryption on an unsupported browser');
		}
		log.info('setting up e2ee');
		if (room !== this.room) {
			this.room = room;
			this.setupEventListeners(room, this.keyProvider);
			const msg: InitMessage = {
				kind: 'init',
				data: {
					keyProviderOptions: this.keyProvider.getOptions(),
					loglevel: workerLogger.getLevel() as LogLevel,
				},
			};
			if (this.worker) {
				log.info(`initializing worker`, {worker: this.worker});
				this.worker.onmessage = this.onWorkerMessage;
				this.worker.onerror = this.onWorkerError;
				this.worker.postMessage(msg);
			}
		}
	}

	setParticipantCryptorEnabled(enabled: boolean, participantIdentity: string) {
		log.debug(`set e2ee to ${enabled} for participant ${participantIdentity}`);
		this.postEnable(enabled, participantIdentity);
	}

	setSifTrailer(trailer: Uint8Array) {
		if (!trailer || trailer.length === 0) {
			log.warn("ignoring server sent trailer as it's empty");
		} else {
			this.postSifTrailer(trailer);
		}
	}

	private onWorkerMessage = (ev: MessageEvent<E2EEWorkerMessage>) => {
		const {kind, data} = ev.data;
		switch (kind) {
			case 'error':
				log.error(data.error.message);

				if (data.uuid) {
					const decryptFuture = this.decryptDataRequests.get(data.uuid);
					if (decryptFuture?.reject) {
						decryptFuture.reject(data.error);
						break;
					}

					const encryptFuture = this.encryptDataRequests.get(data.uuid);
					if (encryptFuture?.reject) {
						encryptFuture.reject(data.error);
						break;
					}
				}

				this.emit(EncryptionEvent.EncryptionError, data.error, data.participantIdentity);
				break;
			case 'initAck':
				if (data.enabled) {
					this.keyProvider.getKeys().forEach((keyInfo) => {
						this.postKey(keyInfo);
					});
				}
				break;

			case 'enable':
				if (data.enabled) {
					this.keyProvider.getKeys().forEach((keyInfo) => {
						this.postKey(keyInfo);
					});
				}
				if (
					this.encryptionEnabled !== data.enabled &&
					data.participantIdentity === this.room?.localParticipant.identity
				) {
					this.emit(EncryptionEvent.ParticipantEncryptionStatusChanged, data.enabled, this.room!.localParticipant);
					this.encryptionEnabled = data.enabled;
				} else if (data.participantIdentity) {
					const participant = this.room?.getParticipantByIdentity(data.participantIdentity);
					if (!participant) {
						throw TypeError(`couldn't set encryption status, participant not found${data.participantIdentity}`);
					}
					this.emit(EncryptionEvent.ParticipantEncryptionStatusChanged, data.enabled, participant);
				}
				break;
			case 'ratchetKey':
				this.keyProvider.emit(
					KeyProviderEvent.KeyRatcheted,
					data.ratchetResult,
					data.participantIdentity,
					data.keyIndex,
				);
				break;

			case 'decryptDataResponse': {
				const decryptFuture = this.decryptDataRequests.get(data.uuid);
				if (decryptFuture?.resolve) {
					decryptFuture.resolve(data);
				}
				break;
			}
			case 'encryptDataResponse': {
				const encryptFuture = this.encryptDataRequests.get(data.uuid);
				if (encryptFuture?.resolve) {
					encryptFuture.resolve(data as EncryptDataResponseMessage['data']);
				}
				break;
			}
			default:
				break;
		}
	};

	private onWorkerError = (ev: ErrorEvent) => {
		log.error('e2ee worker encountered an error:', {error: ev.error});
		this.emit(EncryptionEvent.EncryptionError, ev.error, undefined);
	};

	public setupEngine(engine: RTCEngine) {
		engine.on(EngineEvent.RTPVideoMapUpdate, (rtpMap) => {
			this.postRTPMap(rtpMap);
		});
	}

	private getE2EETransformState(target: RTCRtpReceiver | RTCRtpSender) {
		const state = (target as RTCRtpReceiver & RTCRtpSender & Record<string, unknown>)[E2EE_FLAG];
		if (state && typeof state === 'object') {
			return state as E2EETransformState;
		}
		return undefined;
	}

	private setE2EETransformState(target: RTCRtpReceiver | RTCRtpSender, state: E2EETransformState) {
		(target as RTCRtpReceiver & RTCRtpSender & Record<string, unknown>)[E2EE_FLAG] = state;
	}

	private setupEventListeners(room: Room, keyProvider: BaseKeyProvider) {
		room.on(RoomEvent.TrackPublished, (pub, participant) =>
			this.setParticipantCryptorEnabled(pub.trackInfo!.encryption !== Encryption_Type.NONE, participant.identity),
		);
		room
			.on(RoomEvent.ConnectionStateChanged, (state) => {
				if (state === ConnectionState.Connected) {
					room.remoteParticipants.forEach((participant) => {
						participant.trackPublications.forEach((pub) => {
							this.setParticipantCryptorEnabled(
								pub.trackInfo!.encryption !== Encryption_Type.NONE,
								participant.identity,
							);
						});
					});
				}
			})
			.on(RoomEvent.TrackUnsubscribed, (track, _, participant) => {
				const msg: RemoveTransformMessage = {
					kind: 'removeTransform',
					data: {
						participantIdentity: participant.identity,
						trackId: track.mediaStreamID,
					},
				};
				this.worker?.postMessage(msg);
			})
			.on(RoomEvent.TrackSubscribed, (track, pub, participant) => {
				this.setupE2EEReceiver(track, participant.identity, pub.trackInfo);
			})
			.on(RoomEvent.SignalConnected, () => {
				if (!this.room) {
					throw new TypeError(`expected room to be present on signal connect`);
				}
				keyProvider.getKeys().forEach((keyInfo) => {
					this.postKey(keyInfo);
				});
				this.setParticipantCryptorEnabled(
					this.room.localParticipant.isE2EEEnabled,
					this.room.localParticipant.identity,
				);
			});

		room.localParticipant.on(ParticipantEvent.LocalSenderCreated, async (sender, track, codec, trackId) => {
			this.setupE2EESender(track, sender, codec, trackId);
		});

		room.localParticipant.on(ParticipantEvent.LocalTrackPublished, (publication) => {
			if (!isVideoTrack(publication.track) || !isSafariBased()) {
				return;
			}
			const msg: UpdateCodecMessage = {
				kind: 'updateCodec',
				data: {
					trackId: publication.track!.mediaStreamID,
					codec: mimeTypeToVideoCodecString(publication.trackInfo!.codecs[0].mimeType),
					participantIdentity: this.room!.localParticipant.identity,
				},
			};

			this.worker.postMessage(msg);
		});

		keyProvider
			.on(KeyProviderEvent.SetKey, (keyInfo) => this.postKey(keyInfo))
			.on(KeyProviderEvent.RatchetRequest, (participantId, keyIndex) =>
				this.postRatchetRequest(participantId, keyIndex),
			);
	}

	async encryptData(data: Uint8Array): Promise<EncryptDataResponseMessage['data']> {
		if (!this.worker) {
			throw Error('could not encrypt data, worker is missing');
		}
		const uuid = crypto.randomUUID();
		const msg: EncryptDataRequestMessage = {
			kind: 'encryptDataRequest',
			data: {
				uuid,
				payload: data,
				participantIdentity: this.room!.localParticipant.identity,
			},
		};
		const future = new Future<EncryptDataResponseMessage['data'], Error>();
		future.onFinally = () => {
			this.encryptDataRequests.delete(uuid);
		};
		this.encryptDataRequests.set(uuid, future);
		this.worker.postMessage(msg);
		return future!.promise!;
	}

	handleEncryptedData(payload: Uint8Array, iv: Uint8Array, participantIdentity: string, keyIndex: number) {
		if (!this.worker) {
			throw Error('could not handle encrypted data, worker is missing');
		}
		const uuid = crypto.randomUUID();
		const msg: DecryptDataRequestMessage = {
			kind: 'decryptDataRequest',
			data: {
				uuid,
				payload,
				iv,
				participantIdentity,
				keyIndex,
			},
		};
		const future = new Future<DecryptDataResponseMessage['data'], Error>();
		future.onFinally = () => {
			this.decryptDataRequests.delete(uuid);
		};
		this.decryptDataRequests.set(uuid, future);
		this.worker.postMessage(msg);
		return future.promise;
	}

	private postRatchetRequest(participantIdentity?: string, keyIndex?: number) {
		if (!this.worker) {
			throw Error('could not ratchet key, worker is missing');
		}
		const msg: RatchetRequestMessage = {
			kind: 'ratchetRequest',
			data: {
				participantIdentity: participantIdentity,
				keyIndex,
			},
		};
		this.worker.postMessage(msg);
	}

	private postKey({key, participantIdentity, keyIndex}: KeyInfo) {
		if (!this.worker) {
			throw Error('could not set key, worker is missing');
		}
		const msg: SetKeyMessage = {
			kind: 'setKey',
			data: {
				participantIdentity: participantIdentity,
				isPublisher: participantIdentity === this.room?.localParticipant.identity,
				key,
				keyIndex,
			},
		};
		this.worker.postMessage(msg);
	}

	private postEnable(enabled: boolean, participantIdentity: string) {
		if (this.worker) {
			const enableMsg: EnableMessage = {
				kind: 'enable',
				data: {
					enabled,
					participantIdentity,
				},
			};
			this.worker.postMessage(enableMsg);
		} else {
			throw new ReferenceError('failed to enable e2ee, worker is not ready');
		}
	}

	private postRTPMap(map: Map<number, VideoCodec>) {
		if (!this.worker) {
			throw TypeError('could not post rtp map, worker is missing');
		}
		if (!this.room?.localParticipant.identity) {
			throw TypeError('could not post rtp map, local participant identity is missing');
		}
		const msg: RTPVideoMapMessage = {
			kind: 'setRTPMap',
			data: {
				map,
				participantIdentity: this.room.localParticipant.identity,
			},
		};
		this.worker.postMessage(msg);
	}

	private postSifTrailer(trailer: Uint8Array) {
		if (!this.worker) {
			throw Error('could not post SIF trailer, worker is missing');
		}
		const msg: SifTrailerMessage = {
			kind: 'setSifTrailer',
			data: {
				trailer,
			},
		};
		this.worker.postMessage(msg);
	}

	private setupE2EEReceiver(track: RemoteTrack, remoteId: string, trackInfo?: TrackInfo) {
		if (!track.receiver) {
			return;
		}
		if (!trackInfo?.mimeType || trackInfo.mimeType === '') {
			throw new TypeError('MimeType missing from trackInfo, cannot set up E2EE cryptor');
		}
		this.handleReceiver(
			track.receiver,
			track.mediaStreamID,
			remoteId,
			track.kind === 'video' ? mimeTypeToVideoCodecString(trackInfo.mimeType) : undefined,
		);
	}

	private setupE2EESender(track: Track, sender: RTCRtpSender, codec?: VideoCodec, trackId?: string) {
		if (!isLocalTrack(track) || !sender) {
			if (!sender) log.warn('early return because sender is not ready');
			return;
		}
		const resolvedCodec =
			track.kind === 'video' ? (codec ?? (this.room?.options?.publishDefaults?.videoCodec as VideoCodec)) : undefined;
		this.handleSender(sender, trackId ?? track.mediaStreamID, resolvedCodec);
	}

	private async handleReceiver(
		receiver: RTCRtpReceiver,
		trackId: string,
		participantIdentity: string,
		codec?: VideoCodec,
	) {
		if (!this.worker) {
			return;
		}

		if (isScriptTransformSupported() && !isChromiumBased()) {
			const options: ScriptTransformOptions = {
				kind: 'decode',
				participantIdentity,
				trackId,
				codec,
			};
			receiver.transform = new RTCRtpScriptTransform(this.worker, options);
		} else {
			if (E2EE_FLAG in receiver) {
				const previousState = this.getE2EETransformState(receiver);
				const msg: UpdateTrackContextMessage = {
					kind: 'updateTrackContext',
					data: {
						previousParticipantIdentity: previousState?.participantIdentity,
						previousTrackId: previousState?.trackId,
						trackId,
						participantIdentity,
						codec,
					},
				};
				this.worker.postMessage(msg);
				this.setE2EETransformState(receiver, {trackId, participantIdentity});
				return;
			}
			let writable: WritableStream | undefined = receiver.writableStream;
			let readable: ReadableStream | undefined = receiver.readableStream;

			if (!writable || !readable) {
				const receiverStreams = receiver.createEncodedStreams!();
				receiver.writableStream = receiverStreams.writable;
				writable = receiverStreams.writable;
				receiver.readableStream = receiverStreams.readable;
				readable = receiverStreams.readable;
			}

			const msg: EncodeMessage = {
				kind: 'decode',
				data: {
					readableStream: readable,
					writableStream: writable,
					trackId: trackId,
					codec,
					participantIdentity: participantIdentity,
					isReuse: E2EE_FLAG in receiver,
				},
			};
			this.worker.postMessage(msg, [readable, writable]);
		}

		this.setE2EETransformState(receiver, {trackId, participantIdentity});
	}

	private handleSender(sender: RTCRtpSender, trackId: string, codec?: VideoCodec) {
		if (!this.worker) {
			return;
		}

		if (!this.room?.localParticipant.identity || this.room.localParticipant.identity === '') {
			throw TypeError('local identity needs to be known in order to set up encrypted sender');
		}
		const participantIdentity = this.room.localParticipant.identity;

		if (E2EE_FLAG in sender) {
			const previousState = this.getE2EETransformState(sender);
			const msg: UpdateTrackContextMessage = {
				kind: 'updateTrackContext',
				data: {
					previousParticipantIdentity: previousState?.participantIdentity,
					previousTrackId: previousState?.trackId,
					trackId,
					participantIdentity,
					codec,
				},
			};
			this.worker.postMessage(msg);
			this.setE2EETransformState(sender, {trackId, participantIdentity});
			return;
		}

		if (isScriptTransformSupported() && !isChromiumBased()) {
			log.info('initialize script transform');
			const options = {
				kind: 'encode',
				participantIdentity,
				trackId,
				codec,
			};
			sender.transform = new RTCRtpScriptTransform(this.worker, options);
		} else {
			log.info('initialize encoded streams');
			const senderStreams = sender.createEncodedStreams!();
			const msg: EncodeMessage = {
				kind: 'encode',
				data: {
					readableStream: senderStreams.readable,
					writableStream: senderStreams.writable,
					codec,
					trackId,
					participantIdentity,
					isReuse: false,
				},
			};
			this.worker.postMessage(msg, [senderStreams.readable, senderStreams.writable]);
		}

		this.setE2EETransformState(sender, {trackId, participantIdentity});
	}
}

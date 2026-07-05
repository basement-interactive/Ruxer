// SPDX-FileCopyrightText: 2024 LiveKit, Inc.
//
// SPDX-License-Identifier: Apache-2.0
import type {DataStream_Chunk} from '@livekit/protocol';
import {DataStreamError, DataStreamErrorReason} from '../../errors.ts';
import type {BaseStreamInfo, ByteStreamInfo, TextStreamInfo} from '../../types.ts';
import {bigIntToNumber, Future} from '../../utils.ts';

export type BaseStreamReaderReadAllOpts = {
	signal?: AbortSignal;
};

abstract class BaseStreamReader<T extends BaseStreamInfo> {
	protected reader: ReadableStream<DataStream_Chunk>;

	protected totalByteSize?: number;

	protected _info: T;

	protected bytesReceived: number;

	protected outOfBandFailureRejectingFuture?: Future<never, Error>;

	get info() {
		return this._info;
	}

	protected validateBytesReceived(doneReceiving: boolean = false) {
		if (typeof this.totalByteSize !== 'number' || this.totalByteSize === 0) {
			return;
		}

		if (doneReceiving && this.bytesReceived < this.totalByteSize) {
			throw new DataStreamError(
				`Not enough chunk(s) received - expected ${this.totalByteSize} bytes of data total, only received ${this.bytesReceived} bytes`,
				DataStreamErrorReason.Incomplete,
			);
		} else if (this.bytesReceived > this.totalByteSize) {
			throw new DataStreamError(
				`Extra chunk(s) received - expected ${this.totalByteSize} bytes of data total, received ${this.bytesReceived} bytes`,
				DataStreamErrorReason.LengthExceeded,
			);
		}
	}

	constructor(
		info: T,
		stream: ReadableStream<DataStream_Chunk>,
		totalByteSize?: number,
		outOfBandFailureRejectingFuture?: Future<never, Error>,
	) {
		this.reader = stream;
		this.totalByteSize = totalByteSize;
		this._info = info;
		this.bytesReceived = 0;
		this.outOfBandFailureRejectingFuture = outOfBandFailureRejectingFuture;
	}

	protected abstract handleChunkReceived(chunk: DataStream_Chunk): void;

	onProgress?: (progress: number | undefined) => void;

	abstract readAll(opts?: BaseStreamReaderReadAllOpts): Promise<string | Array<Uint8Array>>;
}

export class ByteStreamReader extends BaseStreamReader<ByteStreamInfo> {
	protected handleChunkReceived(chunk: DataStream_Chunk) {
		this.bytesReceived += chunk.content.byteLength;
		this.validateBytesReceived();

		const currentProgress = this.totalByteSize ? this.bytesReceived / this.totalByteSize : undefined;
		this.onProgress?.(currentProgress);
	}

	signal?: AbortSignal;

	[Symbol.asyncIterator](): AsyncIterator<Uint8Array, undefined> {
		const reader = this.reader.getReader();

		const rejectingSignalFuture = new Future<never, Error>();
		let activeSignal: AbortSignal | null = null;
		let onAbort: (() => void) | null = null;
		if (this.signal) {
			const signal = this.signal;
			onAbort = () => {
				rejectingSignalFuture.reject?.(signal.reason);
			};
			signal.addEventListener('abort', onAbort);
			activeSignal = signal;
		}

		const cleanup = () => {
			reader.releaseLock();

			if (activeSignal && onAbort) {
				activeSignal.removeEventListener('abort', onAbort);
			}

			this.signal = undefined;
		};

		return {
			next: async (): Promise<IteratorResult<Uint8Array, undefined>> => {
				try {
					const {done, value} = await Promise.race([
						reader.read(),
						rejectingSignalFuture.promise,
						this.outOfBandFailureRejectingFuture?.promise ?? new Promise<never>(() => {}),
					]);
					if (done) {
						this.validateBytesReceived(true);
						return {done: true, value: undefined};
					} else {
						this.handleChunkReceived(value);
						return {done: false, value: value.content};
					}
				} catch (err) {
					cleanup();
					throw err;
				}
			},

			async return(): Promise<IteratorResult<Uint8Array, undefined>> {
				cleanup();
				return {done: true, value: undefined};
			},
		};
	}

	withAbortSignal(signal: AbortSignal) {
		this.signal = signal;
		return this;
	}

	async readAll(opts: BaseStreamReaderReadAllOpts = {}): Promise<Array<Uint8Array>> {
		const chunks: Set<Uint8Array> = new Set();
		const iterator = opts.signal ? this.withAbortSignal(opts.signal) : this;
		for await (const chunk of iterator) {
			chunks.add(chunk);
		}
		return Array.from(chunks);
	}
}

export class TextStreamReader extends BaseStreamReader<TextStreamInfo> {
	private receivedChunks: Map<number, DataStream_Chunk>;

	signal?: AbortSignal;

	constructor(
		info: TextStreamInfo,
		stream: ReadableStream<DataStream_Chunk>,
		totalChunkCount?: number,
		outOfBandFailureRejectingFuture?: Future<never, Error>,
	) {
		super(info, stream, totalChunkCount, outOfBandFailureRejectingFuture);
		this.receivedChunks = new Map();
	}

	protected handleChunkReceived(chunk: DataStream_Chunk) {
		const index = bigIntToNumber(chunk.chunkIndex);
		const previousChunkAtIndex = this.receivedChunks.get(index);
		if (previousChunkAtIndex && previousChunkAtIndex.version > chunk.version) {
			return;
		}
		this.receivedChunks.set(index, chunk);

		this.bytesReceived += chunk.content.byteLength;
		this.validateBytesReceived();

		const currentProgress = this.totalByteSize ? this.bytesReceived / this.totalByteSize : undefined;
		this.onProgress?.(currentProgress);
	}

	[Symbol.asyncIterator]() {
		const reader = this.reader.getReader();
		const decoder = new TextDecoder('utf-8', {fatal: true});

		const rejectingSignalFuture = new Future<never, Error>();
		let activeSignal: AbortSignal | null = null;
		let onAbort: (() => void) | null = null;
		if (this.signal) {
			const signal = this.signal;
			onAbort = () => {
				rejectingSignalFuture.reject?.(signal.reason);
			};
			signal.addEventListener('abort', onAbort);
			activeSignal = signal;
		}

		const cleanup = () => {
			reader.releaseLock();

			if (activeSignal && onAbort) {
				activeSignal.removeEventListener('abort', onAbort);
			}

			this.signal = undefined;
		};

		return {
			next: async (): Promise<IteratorResult<string>> => {
				try {
					const {done, value} = await Promise.race([
						reader.read(),
						rejectingSignalFuture.promise,
						this.outOfBandFailureRejectingFuture?.promise ?? new Promise<never>(() => {}),
					]);
					if (done) {
						this.validateBytesReceived(true);
						return {done: true, value: undefined};
					} else {
						this.handleChunkReceived(value);

						let decodedResult: string;
						try {
							decodedResult = decoder.decode(value.content);
						} catch (err) {
							throw new DataStreamError(
								`Cannot decode datastream chunk ${value.chunkIndex} as text: ${err}`,
								DataStreamErrorReason.DecodeFailed,
							);
						}

						return {
							done: false,
							value: decodedResult,
						};
					}
				} catch (err) {
					cleanup();
					throw err;
				}
			},

			async return(): Promise<IteratorResult<string>> {
				cleanup();
				return {done: true, value: undefined};
			},
		};
	}

	withAbortSignal(signal: AbortSignal) {
		this.signal = signal;
		return this;
	}

	async readAll(opts: BaseStreamReaderReadAllOpts = {}): Promise<string> {
		let finalString: string = '';
		const iterator = opts.signal ? this.withAbortSignal(opts.signal) : this;
		for await (const chunk of iterator) {
			finalString += chunk;
		}
		return finalString;
	}
}

export type ByteStreamHandler = (reader: ByteStreamReader, participantInfo: {identity: string}) => void;

export type TextStreamHandler = (reader: TextStreamReader, participantInfo: {identity: string}) => void;

// SPDX-License-Identifier: AGPL-3.0-or-later
/* tslint:disable */
/* eslint-disable */

export function compress_zstd_stream_chunk(encoder_ptr: number, input: Uint8Array): Uint8Array;

export function create_zstd_stream_decoder(): number;

export function create_zstd_stream_encoder(level: number): number;

export function crop_rotate_rgba_raw(input: Uint8Array, src_width: number, src_height: number, x: number, y: number, width: number, height: number, rotation_deg: number, resize_width?: number | null, resize_height?: number | null): Uint8Array;

export function decompress_zstd_frame(input: Uint8Array): Uint8Array;

export function decompress_zstd_stream_chunk(decoder_ptr: number, input: Uint8Array): Uint8Array;

export function free_zstd_stream_decoder(decoder_ptr: number): void;

export function free_zstd_stream_encoder(encoder_ptr: number): void;

export function is_animated_image(input: Uint8Array): boolean;

export function __resetLibfluxcoreWasmForMemoryPressure(): void;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly compress_zstd_stream_chunk: (a: number, b: number, c: number, d: number) => void;
    readonly create_zstd_stream_decoder: (a: number) => void;
    readonly create_zstd_stream_encoder: (a: number, b: number) => void;
    readonly crop_rotate_rgba_raw: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number) => void;
    readonly decompress_zstd_frame: (a: number, b: number, c: number) => void;
    readonly decompress_zstd_stream_chunk: (a: number, b: number, c: number, d: number) => void;
    readonly free_zstd_stream_decoder: (a: number) => void;
    readonly free_zstd_stream_encoder: (a: number) => void;
    readonly is_animated_image: (a: number, b: number) => number;
    readonly rust_zstd_wasm_shim_calloc: (a: number, b: number) => number;
    readonly rust_zstd_wasm_shim_free: (a: number) => void;
    readonly rust_zstd_wasm_shim_malloc: (a: number) => number;
    readonly rust_zstd_wasm_shim_memcmp: (a: number, b: number, c: number) => number;
    readonly rust_zstd_wasm_shim_memcpy: (a: number, b: number, c: number) => number;
    readonly rust_zstd_wasm_shim_memmove: (a: number, b: number, c: number) => number;
    readonly rust_zstd_wasm_shim_memset: (a: number, b: number, c: number) => number;
    readonly rust_zstd_wasm_shim_qsort: (a: number, b: number, c: number, d: number) => void;
    readonly __wbindgen_add_to_stack_pointer: (a: number) => number;
    readonly __wbindgen_export: (a: number, b: number) => number;
    readonly __wbindgen_export2: (a: number, b: number, c: number) => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;

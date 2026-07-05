// SPDX-FileCopyrightText: 2024 LiveKit, Inc.
//
// SPDX-License-Identifier: Apache-2.0
type Primitives = null | undefined | string | number | bigint | boolean | symbol;

export type Throws<T, E extends Error> = (T & {readonly __throws?: E}) | Extract<T, Primitives>;

export type ExtractErrors<T> = T extends Throws<unknown, infer E extends Error> ? E : never;

export type ExtractSuccess<T> = T extends Throws<infer S, Error> ? S : T;

export type CombineErrors<T extends Array<unknown>> = T extends [infer First, ...infer Rest]
	? ExtractErrors<First> | CombineErrors<Rest>
	: never;

export type PropagatesErrors<T, AdditionalErrors extends Error = never> = Throws<
	ExtractSuccess<T>,
	ExtractErrors<T> | AdditionalErrors
>;

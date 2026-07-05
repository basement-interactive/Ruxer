// SPDX-FileCopyrightText: 2024 LiveKit, Inc.
//
// SPDX-License-Identifier: Apache-2.0
type InferErrors<T> = T extends TypedPromise<unknown, infer E> ? E : never;

export default class TypedPromise<T, E extends Error> extends Promise<T> {
	override catch<TResult = never>(
		onrejected?: ((reason: E) => TResult | PromiseLike<TResult>) | null | undefined,
	): TypedPromise<T | TResult, E> {
		return super.catch(onrejected);
	}

	static override resolve: {
		(): TypedPromise<void, never>;
		<V>(value: V): TypedPromise<Awaited<V>, never>;
	} = <V>(value?: V): TypedPromise<Awaited<V>, never> => {
		return super.resolve(value) as TypedPromise<Awaited<V>, never>;
	};

	static override reject<E extends Error>(reason: E): TypedPromise<never, E> {
		return Promise.reject(reason);
	}

	static override all<T extends ReadonlyArray<unknown> | []>(
		values: T,
	): TypedPromise<{-readonly [P in keyof T]: Awaited<T[P]>}, InferErrors<T[number]>> {
		return Promise.all(values) as TypedPromise<{-readonly [P in keyof T]: Awaited<T[P]>}, InferErrors<T[number]>>;
	}

	static override race<T extends ReadonlyArray<unknown>>(
		values: T,
	): TypedPromise<
		T[number] extends TypedPromise<infer U, Error>
			? U
			: T[number] extends PromiseLike<infer U>
				? U
				: Awaited<T[number]>,
		InferErrors<T[number]>
	> {
		return Promise.race(values) as TypedPromise<
			T[number] extends TypedPromise<infer U, Error>
				? U
				: T[number] extends PromiseLike<infer U>
					? U
					: Awaited<T[number]>,
			InferErrors<T[number]>
		>;
	}
}

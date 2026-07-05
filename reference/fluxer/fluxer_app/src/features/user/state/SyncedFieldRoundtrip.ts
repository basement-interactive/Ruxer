// SPDX-License-Identifier: AGPL-3.0-or-later

import {create, equals, type Message, type MessageInitShape} from '@bufbuild/protobuf';
import type {GenMessage} from '@bufbuild/protobuf/codegenv2';

export function verifyRoundtripStability<T extends object, M extends Message>(args: {
	schema: GenMessage<M>;
	store: T;
	toMessage: (s: T) => MessageInitShape<GenMessage<M>>;
	applyMessage: (s: T, m: M) => void;
	candidate: M;
}): {stable: boolean; threw?: unknown} {
	const probeStore = Object.create(Object.getPrototypeOf(args.store)) as T;
	Object.assign(probeStore, args.store);
	try {
		args.applyMessage(probeStore, args.candidate);
	} catch (error) {
		return {stable: false, threw: error};
	}
	const after = create(args.schema, args.toMessage(probeStore)) as M;
	return {stable: equals(args.schema, args.candidate, after)};
}

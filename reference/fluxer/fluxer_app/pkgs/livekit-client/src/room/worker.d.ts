// SPDX-FileCopyrightText: 2024 LiveKit, Inc.
//
// SPDX-License-Identifier: Apache-2.0
declare module 'web-worker:*' {
	const WorkerFactory: new () => Worker;
	export default WorkerFactory;
}

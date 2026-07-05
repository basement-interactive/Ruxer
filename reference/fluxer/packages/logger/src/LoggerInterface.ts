// SPDX-License-Identifier: AGPL-3.0-or-later

export interface LoggerInterface {
	trace(obj: Record<string, unknown>, msg?: string): void;
	trace(msg: string): void;
	debug(obj: Record<string, unknown>, msg?: string): void;
	debug(msg: string): void;
	info(obj: Record<string, unknown>, msg?: string): void;
	info(msg: string): void;
	warn(obj: Record<string, unknown>, msg?: string): void;
	warn(msg: string): void;
	error(obj: Record<string, unknown>, msg?: string): void;
	error(msg: string): void;
	child(bindings: Record<string, unknown>): LoggerInterface;
}

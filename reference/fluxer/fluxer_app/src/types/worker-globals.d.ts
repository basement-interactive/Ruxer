// SPDX-License-Identifier: AGPL-3.0-or-later

interface ExtendableEvent extends Event {
	waitUntil(promise: PromiseLike<unknown>): void;
}

interface ExtendableMessageEvent extends ExtendableEvent {
	readonly data: unknown;
}

interface FetchEvent extends ExtendableEvent {
	readonly request: Request;
	respondWith(response: Response | PromiseLike<Response>): void;
}

interface PushMessageData {
	arrayBuffer(): ArrayBuffer;
	blob(): Blob;
	json(): unknown;
	text(): string;
}

interface PushEvent extends ExtendableEvent {
	readonly data: PushMessageData | null;
}

interface NotificationEvent extends ExtendableEvent {
	readonly notification: Notification;
	readonly action: string;
}

interface PushSubscriptionChangeEvent extends ExtendableEvent {
	oldSubscription?: PushSubscription | null;
	newSubscription?: PushSubscription | null;
}

interface Client {
	readonly id: string;
	readonly type: string;
	readonly url: string;
	postMessage(message: unknown): void;
}

interface WindowClient extends Client {
	readonly focused: boolean;
	readonly visibilityState: DocumentVisibilityState;
	focus(): Promise<WindowClient>;
	navigate(url: string): Promise<WindowClient | null>;
}

interface ClientQueryOptions {
	includeUncontrolled?: boolean;
	type?: 'all' | 'window' | 'worker' | 'sharedworker';
}

interface Clients {
	claim(): Promise<void>;
	get(id: string): Promise<Client | undefined>;
	matchAll(options: ClientQueryOptions & {type: 'window'}): Promise<Array<WindowClient>>;
	matchAll(options?: ClientQueryOptions): Promise<Array<Client>>;
	openWindow(url: string): Promise<WindowClient | null>;
}

interface ServiceWorkerGlobalScope extends EventTarget {
	readonly clients: Clients;
	readonly location: WorkerLocation;
	readonly navigator: WorkerNavigator;
	readonly registration: ServiceWorkerRegistration;
	skipWaiting(): void;
	addEventListener(
		type: 'install' | 'activate',
		listener: (event: ExtendableEvent) => void,
		options?: boolean | AddEventListenerOptions,
	): void;
	addEventListener(
		type: 'message',
		listener: (event: ExtendableMessageEvent) => void,
		options?: boolean | AddEventListenerOptions,
	): void;
	addEventListener(
		type: 'fetch',
		listener: (event: FetchEvent) => void,
		options?: boolean | AddEventListenerOptions,
	): void;
	addEventListener(
		type: 'push',
		listener: (event: PushEvent) => void,
		options?: boolean | AddEventListenerOptions,
	): void;
	addEventListener(
		type: 'pushsubscriptionchange',
		listener: (event: PushSubscriptionChangeEvent) => void,
		options?: boolean | AddEventListenerOptions,
	): void;
	addEventListener(
		type: 'notificationclick' | 'notificationclose',
		listener: (event: NotificationEvent) => void,
		options?: boolean | AddEventListenerOptions,
	): void;
	addEventListener(
		type: string,
		listener: EventListenerOrEventListenerObject,
		options?: boolean | AddEventListenerOptions,
	): void;
}

interface DedicatedWorkerGlobalScope extends EventTarget {
	postMessage(message: unknown, transfer?: Array<Transferable>): void;
	addEventListener(
		type: 'message',
		listener: (event: MessageEvent) => void,
		options?: boolean | AddEventListenerOptions,
	): void;
	addEventListener(
		type: string,
		listener: EventListenerOrEventListenerObject,
		options?: boolean | AddEventListenerOptions,
	): void;
}

interface PushManager {
	getSubscription(): Promise<PushSubscription | null>;
	subscribe(options?: PushSubscriptionOptionsInit): Promise<PushSubscription>;
}

interface ServiceWorkerRegistration {
	readonly pushManager: PushManager;
	getNotifications(options?: GetNotificationOptions): Promise<Array<Notification>>;
}

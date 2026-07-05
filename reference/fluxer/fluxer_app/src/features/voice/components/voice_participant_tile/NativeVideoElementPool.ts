// SPDX-License-Identifier: AGPL-3.0-or-later

export const NATIVE_VIDEO_ELEMENT_POOL_MAX = 16;

class NativeVideoElementPool {
	private elements = new Map<string, HTMLVideoElement>();

	get size(): number {
		return this.elements.size;
	}

	has(trackSid: string): boolean {
		return this.elements.has(trackSid);
	}

	acquire(trackSid: string): HTMLVideoElement {
		const existing = this.elements.get(trackSid);
		if (existing) {
			if (existing.isConnected) {
				return this.createElement();
			}
			this.elements.delete(trackSid);
			this.elements.set(trackSid, existing);
			return existing;
		}
		const element = this.createElement();
		this.elements.set(trackSid, element);
		while (this.elements.size > NATIVE_VIDEO_ELEMENT_POOL_MAX) {
			const oldestTrackSid = this.elements.keys().next().value;
			if (oldestTrackSid === undefined) break;
			this.release(oldestTrackSid);
		}
		return element;
	}

	isPooledFor(trackSid: string, element: HTMLVideoElement): boolean {
		return this.elements.get(trackSid) === element;
	}

	private createElement(): HTMLVideoElement {
		const element = document.createElement('video');
		element.autoplay = true;
		element.muted = true;
		element.playsInline = true;
		return element;
	}

	release(trackSid: string): void {
		const element = this.elements.get(trackSid);
		if (!element) return;
		this.elements.delete(trackSid);
		element.srcObject = null;
		element.remove();
	}

	clear(): void {
		for (const trackSid of [...this.elements.keys()]) {
			this.release(trackSid);
		}
	}
}

export default new NativeVideoElementPool();
export {NativeVideoElementPool};

// SPDX-License-Identifier: AGPL-3.0-or-later

import {autorun} from 'mobx';
import {describe, expect, it} from 'vitest';
import {Store} from './Store';

class TestStore extends Store {
	bump(): void {
		this.update(() => {});
	}
}

describe('Store', () => {
	it('exposes updates through MobX observation for observer components', () => {
		const store = new TestStore();
		const snapshots: Array<number> = [];
		const dispose = autorun(() => {
			snapshots.push(store.getMobxSnapshot());
		});

		store.bump();

		dispose();
		expect(snapshots).toEqual([0, 1]);
	});
});

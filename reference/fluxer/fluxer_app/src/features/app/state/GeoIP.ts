// SPDX-License-Identifier: AGPL-3.0-or-later

import type {GeoEntry, GeolocationResponse} from '@fluxer/instance_bootstrap/src/Types';
import {makeAutoObservable, runInAction} from 'mobx';

interface ConnectionGeoCoordinates {
	latitude: string | null;
	longitude: string | null;
}

function getInlinedGeoip(): GeolocationResponse {
	const bootstrap = typeof window !== 'undefined' ? window.__FLUXER_BOOTSTRAP__ : undefined;
	if (!bootstrap) {
		throw new Error('window.__FLUXER_BOOTSTRAP__ is missing — app must be served by fluxer_app_proxy');
	}
	return bootstrap.geoip;
}

class GeoIP {
	countryCode: string | null;
	regionCode: string | null;
	latitude: string | null;
	longitude: string | null;
	ageRestrictedGeos: ReadonlyArray<GeoEntry>;
	ageBlockedGeos: ReadonlyArray<GeoEntry>;

	constructor() {
		const data = getInlinedGeoip();
		this.countryCode = data.countryCode;
		this.regionCode = data.regionCode;
		this.latitude = data.latitude;
		this.longitude = data.longitude;
		this.ageRestrictedGeos = data.ageRestrictedGeos;
		this.ageBlockedGeos = data.ageBlockedGeos;
		makeAutoObservable(this, {}, {autoBind: true});
	}

	applyConnectionFallbackCoordinates(data: ConnectionGeoCoordinates): void {
		if (data.latitude === null || data.longitude === null) {
			return;
		}
		if (this.latitude !== null && this.longitude !== null) {
			return;
		}
		runInAction(() => {
			if (this.latitude === null) {
				this.latitude = data.latitude;
			}
			if (this.longitude === null) {
				this.longitude = data.longitude;
			}
		});
	}

	isBlocked(): boolean {
		if (!this.countryCode) return false;
		return this.ageBlockedGeos.some((geo) => {
			if (geo.countryCode !== this.countryCode) return false;
			if (geo.regionCode === null) return true;
			return geo.regionCode === this.regionCode;
		});
	}
}

export default new GeoIP();

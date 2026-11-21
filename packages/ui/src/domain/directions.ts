export interface Coordinates {
	lat: number;
	lon: number;
}

export interface DirectionsLinks {
	openStreetMap: string;
	appleMaps: string;
	googleMaps: string;
}

const coordinate = (value: number) => value.toFixed(6).replace(/\.?0+$/, "");

/**
 * Directions to a place in the three common map apps, as plain URLs: no API
 * key, no script, no tracking pixel. The visitor's app picks the start point.
 */
export function directionsLinks({ lat, lon }: Coordinates): DirectionsLinks {
	if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
		throw new RangeError(`Invalid coordinates: ${lat}, ${lon}`);
	}
	const point = `${coordinate(lat)},${coordinate(lon)}`;
	return {
		openStreetMap: `https://www.openstreetmap.org/directions?route=%3B${encodeURIComponent(point)}#map=17/${coordinate(lat)}/${coordinate(lon)}`,
		appleMaps: `https://maps.apple.com/?daddr=${encodeURIComponent(point)}`,
		googleMaps: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(point)}`,
	};
}

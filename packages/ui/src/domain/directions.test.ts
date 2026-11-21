import { describe, expect, it } from "vitest";
import { directionsLinks } from "./directions";

describe("directionsLinks", () => {
	it("builds key-free links for the three map apps", () => {
		const links = directionsLinks({ lat: 48.8566, lon: 2.3522 });
		expect(links.openStreetMap).toBe(
			"https://www.openstreetmap.org/directions?route=%3B48.8566%2C2.3522#map=17/48.8566/2.3522",
		);
		expect(links.appleMaps).toBe("https://maps.apple.com/?daddr=48.8566%2C2.3522");
		expect(links.googleMaps).toBe(
			"https://www.google.com/maps/dir/?api=1&destination=48.8566%2C2.3522",
		);
	});

	it("rounds to six decimals and trims trailing zeros", () => {
		expect(directionsLinks({ lat: 45.1234567891, lon: -1.5 }).appleMaps).toBe(
			"https://maps.apple.com/?daddr=45.123457%2C-1.5",
		);
	});

	it("rejects impossible coordinates", () => {
		expect(() => directionsLinks({ lat: 91, lon: 0 })).toThrow(RangeError);
		expect(() => directionsLinks({ lat: Number.NaN, lon: 0 })).toThrow(RangeError);
	});
});

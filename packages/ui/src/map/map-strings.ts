/**
 * The interface strings MapLibre GL prints or announces on a map (control
 * titles, the cooperative gestures hint, accessible names), so the app can
 * translate them. Plain data: no MapLibre import, safe for any bundle.
 */
export const MAP_STRING_KEYS = [
	"map",
	"marker",
	"zoomIn",
	"zoomOut",
	"resetBearing",
	"toggleAttribution",
	"mapFeedback",
	"logo",
	"closePopup",
	"scrollZoomWindows",
	"scrollZoomMac",
	"twoFingers",
] as const;

export type MapStringKey = (typeof MAP_STRING_KEYS)[number];

export type MapStrings = Readonly<Record<MapStringKey, string>>;

/** MapLibre's string ids (its `locale` option) for each key. */
const MAPLIBRE_IDS: Readonly<Record<MapStringKey, string>> = {
	map: "Map.Title",
	marker: "Marker.Title",
	zoomIn: "NavigationControl.ZoomIn",
	zoomOut: "NavigationControl.ZoomOut",
	resetBearing: "NavigationControl.ResetBearing",
	toggleAttribution: "AttributionControl.ToggleAttribution",
	mapFeedback: "AttributionControl.MapFeedback",
	logo: "LogoControl.Title",
	closePopup: "Popup.Close",
	scrollZoomWindows: "CooperativeGesturesHandler.WindowsHelpText",
	scrollZoomMac: "CooperativeGesturesHandler.MacHelpText",
	twoFingers: "CooperativeGesturesHandler.MobileHelpText",
};

/** The `locale` option of a MapLibre map for these strings. */
export function mapLibreLocale(strings: Partial<MapStrings> | undefined): Record<string, string> {
	const locale: Record<string, string> = {};
	if (!strings) return locale;
	for (const key of MAP_STRING_KEYS) {
		const value = strings[key];
		if (value) locale[MAPLIBRE_IDS[key]] = value;
	}
	return locale;
}

import { MAP_STRING_KEYS, type MapStrings } from "@apercura/ui";
import { getTranslations } from "next-intl/server";
import type { Locale } from "~/i18n/routing";

/**
 * MapLibre's interface strings (control titles, the "Ctrl + scroll" hint,
 * accessible names) from the `Map` namespace of the catalog, for `MapView`.
 */
export async function getMapStrings(locale: Locale): Promise<MapStrings> {
	const t = await getTranslations({ locale, namespace: "Map" });
	return Object.fromEntries(MAP_STRING_KEYS.map((key) => [key, t(key)])) as MapStrings;
}

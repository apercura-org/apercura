/**
 * The Swiss lists read by `etl:ch`, as named in `--sources`, `stats.sources` and the guards: the
 * FOPH's hospital figures and the cantons' open lists, each under the terms opendata.swiss
 * records for it ("Open use" or "Open use. Must provide the source.") and with the credit its
 * publisher asks for (`switzerland.registries` in @apercura/core). A list that cannot be read is
 * left out and keeps its pages (exit code 3).
 */
import type { ChIdScheme } from "@apercura/core";
import { CH_HOSPITAL_FIGURES_YEAR } from "@apercura/core/country";
import {
	CH_BIRTH_CENTRE,
	CH_HOSPITAL,
	CH_NURSING_HOME,
	CH_PHARMACY,
	CH_PSYCHIATRIC_CLINIC,
	CH_REHAB_CLINIC,
	CH_SPECIALTY_CLINIC,
} from "@apercura/core/taxonomy";

export const CH_SOURCE_IDS = [
	"bag",
	"be-spitaeler",
	"be-heime",
	"ge-hopitaux",
	"ge-ems",
	"ge-pharmacies",
	"bl-apotheken",
	"bl-heime",
	"bs-spitaeler",
	"bs-heime",
	"zh-heime",
	"ju-institutions",
] as const;

export type ChSourceId = (typeof CH_SOURCE_IDS)[number];

/** How a list is published: a workbook, a GeoJSON file (or a ZIP holding one), a CSV, a shapefile in a ZIP. */
export type ChFormat = "xlsx" | "geojson" | "geojson-zip" | "csv" | "shapefile-zip";

const BERN_WFS =
	"https://www.geoservice.apps.be.ch/geoservice3/services/a42geo/of_health01_de_ms_wfs/MapServer/WFSServer?service=WFS&version=2.0.0&request=GetFeature&outputFormat=GEOJSON&typeNames=";

export type ChSourceConfig = {
	/** The canton whose list it is (`ZH`), or null for the federal figures. */
	canton: string | null;
	/** Where it is published (overridden by `ETL_CH_<ID>_URL`). */
	url: string;
	format: ChFormat;
	/** File name in `--source-dir` and the work directory. */
	file: string;
	idScheme: ChIdScheme;
	/** The activities' and sites' source, also the registry id of its credit. */
	registry: string;
	/** The kinds of facility it can hold. */
	professions: readonly string[];
	/** A size floor below which the file is broken, not short. */
	minBytes: number;
};

const HOSPITAL_KINDS = [
	CH_HOSPITAL,
	CH_PSYCHIATRIC_CLINIC,
	CH_REHAB_CLINIC,
	CH_SPECIALTY_CLINIC,
	CH_BIRTH_CENTRE,
] as const;

export const CH_SOURCES: Readonly<Record<ChSourceId, ChSourceConfig>> = {
	bag: {
		canton: null,
		// The FOPH's own server of the opendata.swiss distribution (opendata.bagnet.ch) answers
		// 503 at times; its statistics site serves the same workbook.
		url: `https://spitalstatistik-ld.bagapps.ch/data/download/archiv/KZP/${CH_HOSPITAL_FIGURES_YEAR}/kzp${String(CH_HOSPITAL_FIGURES_YEAR).slice(2)}_data.xlsx`,
		format: "xlsx",
		file: "bag-kzp.xlsx",
		idScheme: "CH-BAG",
		registry: "ch-bag-kzp",
		professions: HOSPITAL_KINDS,
		minBytes: 2_000,
	},
	"be-spitaeler": {
		canton: "BE",
		url: `${BERN_WFS}of_health01_de_ms_wfs:SPITAL_SPITKLIN_VW_8200`,
		format: "geojson",
		file: "be-spitaeler.geojson",
		idScheme: "CH-BE-SPITAL",
		registry: "ch-be-spitaeler",
		professions: HOSPITAL_KINDS,
		minBytes: 500,
	},
	"be-heime": {
		canton: "BE",
		url: `${BERN_WFS}of_health01_de_ms_wfs:ILV_STOALTER_VW_20214`,
		format: "geojson",
		file: "be-heime.geojson",
		idScheme: "CH-BE-PH",
		registry: "ch-be-heime",
		professions: [CH_NURSING_HOME],
		minBytes: 500,
	},
	"ge-hopitaux": {
		canton: "GE",
		url: "https://extract.sitg.ge.ch/files/DAS_HOPITAUX_CLINIQUES-geojson.zip",
		format: "geojson-zip",
		file: "ge-hopitaux.zip",
		idScheme: "CH-GE-HOP",
		registry: "ch-ge-hopitaux",
		professions: HOSPITAL_KINDS,
		minBytes: 500,
	},
	"ge-ems": {
		canton: "GE",
		url: "https://extract.sitg.ge.ch/files/DAS_EMS-geojson.zip",
		format: "geojson-zip",
		file: "ge-ems.zip",
		idScheme: "CH-GE-EMS",
		registry: "ch-ge-ems",
		professions: [CH_NURSING_HOME],
		minBytes: 500,
	},
	"ge-pharmacies": {
		canton: "GE",
		url: "https://vector.sitg.ge.ch/arcgis/rest/services/GEO_SANTE_VACCINATION_PHARM/MapServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=geojson",
		format: "geojson",
		file: "ge-pharmacies.geojson",
		idScheme: "CH-GE-PHARM",
		registry: "ch-ge-pharmacies",
		professions: [CH_PHARMACY],
		minBytes: 500,
	},
	"bl-apotheken": {
		canton: "BL",
		url: "https://data.bl.ch/api/explore/v2.1/catalog/datasets/10320/exports/geojson",
		format: "geojson",
		file: "bl-apotheken.geojson",
		idScheme: "CH-BL-PHARM",
		registry: "ch-bl-apotheken",
		professions: [CH_PHARMACY],
		minBytes: 500,
	},
	"bl-heime": {
		canton: "BL",
		url: "https://data.bl.ch/api/explore/v2.1/catalog/datasets/10310/exports/geojson",
		format: "geojson",
		file: "bl-heime.geojson",
		idScheme: "CH-BL-PH",
		registry: "ch-bl-heime",
		professions: [CH_NURSING_HOME],
		minBytes: 500,
	},
	"bs-spitaeler": {
		canton: "BS",
		url: "https://api.geo.bs.ch/stac/v1/download/SPTL/latest/geojson",
		format: "geojson-zip",
		file: "bs-spitaeler.zip",
		idScheme: "CH-BS-SPITAL",
		registry: "ch-bs-spitaeler",
		professions: HOSPITAL_KINDS,
		minBytes: 300,
	},
	"bs-heime": {
		canton: "BS",
		url: "https://api.geo.bs.ch/stac/v1/download/APFH/latest/geojson",
		format: "geojson-zip",
		file: "bs-heime.zip",
		idScheme: "CH-BS-PH",
		registry: "ch-bs-heime",
		professions: [CH_NURSING_HOME],
		minBytes: 300,
	},
	"zh-heime": {
		canton: "ZH",
		url: "https://daten.statistik.zh.ch/ogd/daten/ressourcen/KTZH_00003102_00006486.csv",
		format: "csv",
		file: "zh-heime.csv",
		idScheme: "CH-ZH-PH",
		registry: "ch-zh-heime",
		professions: [CH_NURSING_HOME],
		minBytes: 1_000,
	},
	"ju-institutions": {
		canton: "JU",
		url: "https://geo.jura.ch/geodonnees/donnees/SSA_19_04_Institutions_de_soins_et_de_sante.zip",
		format: "shapefile-zip",
		file: "ju-institutions.zip",
		idScheme: "CH-JU",
		registry: "ch-ju-institutions",
		professions: [...HOSPITAL_KINDS, CH_NURSING_HOME],
		minBytes: 1_000,
	},
};

/** The places' support file the run locates facilities with: swisstopo's postcode directory. */
export const CH_POSTCODES = {
	url: "https://data.geo.admin.ch/ch.swisstopo-vd.ortschaftenverzeichnis_plz/ortschaftenverzeichnis_plz/ortschaftenverzeichnis_plz_4326.csv.zip",
	file: "plz.zip",
	minBytes: 300,
} as const;

/** The Federal Statistical Office's commune register on a day (`DD-MM-YYYY`). */
export const chCommunesUrl = (day: string) =>
	`https://www.agvchapp.bfs.admin.ch/api/communes/snapshot?date=${day}`;

/** The file of the commune register in `--source-dir`. */
export const CH_COMMUNES_FILE = "bfs-gemeinden.csv";

/** The `ETL_CH_<ID>_URL` variable that overrides a list's address. */
export const chSourceUrlVariable = (id: ChSourceId) =>
	`ETL_CH_${id.toUpperCase().replace(/-/g, "_")}_URL`;

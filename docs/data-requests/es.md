# Spain: data we could not import yet

Spain's directory (`/es`) is built from the General Register of health centres, services and
establishments (Registro General de centros, servicios y establecimientos sanitarios, REGCESS),
whose monthly extracts the Ministerio de Sanidad publishes for reuse under Ley 37/2007
([`docs/data-import.md`](../data-import.md#spain)): hospitals, the public network's health centres
and local surgeries, doctors' practices, the other health professions' practices, polyclinics,
dental clinics and pharmacies, placed in the IGN's autonomous communities, provinces and
municipalities (CC BY 4.0). A page is a centre, under its name in the register. This file lists
every other candidate found on 26 November 2026, why it is not imported, and whom to ask, so that
requests can be sent. The requests for the registers of people (REPS and the colegios) are
[`es-reps.md`](es-reps.md) and [`es-cgcom.md`](es-cgcom.md).

The search covered the REGCESS download page, datos.gob.es, the Ministry's statistics pages
(Catálogo Nacional de Hospitales, Catálogo de Centros de Atención Primaria), the IGN and CNIG
download centres and APIs, and the INE's municipal codes.

## Imported

| Dataset                                                                                                                                  | Publisher                            | Licence                                                                                                | Attribution                                                                          |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| [REGCESS monthly extracts](https://regcess.mscbs.es/regcessWeb/) C1 (hospitals), C2 (centres without inpatient care), E (establishments) | Ministerio de Sanidad                | [Legal notice](https://www.sanidad.gob.es/avisoLegal/home.htm), Ley 37/2007: cite, date, no distortion | `Fuente: Ministerio de Sanidad, REGCESS, actualizado {date}`                         |
| IGN OGC API Features: `administrativeunit` (Líneas Límite Municipales) and `nuc` (IGR Poblaciones)                                       | Instituto Geográfico Nacional (CNIG) | CC BY 4.0 (Orden FOM/2807/2015)                                                                        | `Obra derivada de Líneas Límite Municipales e IGR Poblaciones 2025 CC-BY 4.0 ign.es` |

Columns of the extracts that are read but never stored: e-mail, fax, web address, the regional
code, the health area, the functional dependency (only the public or private group is kept), the
authorisation dates and the beds. For a sole trader the e-mail and phone may be personal: the
phone is kept as the centre's published number unless more than three centres share it.

## Not imported, and why

| Candidate                                                                                                                                                                            | What it would add                                                                   | Why not now                                                                                                                                                                                             | Whom to ask                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| REGCESS types left out (C190, C252–C259, C2510, C2511, C2590, C290; C3 services; E2 first-aid kits, E3 opticians, E4 orthopaedic, E5 hearing-aid shops)                              | About 46,000 more centres: mental health centres, diagnostics, dialysis, opticians… | Kept focused for the opening; mobile units (11,651, mostly ambulances) are not places; opticians and hearing-aid shops would need listings of their own                                                 | Nobody: the same extracts, a decision of the project              |
| [Catálogo Nacional de Hospitales](https://www.sanidad.gob.es/estadEstudios/estadisticas/sisInfSanSNS/ofertaRecursos/hospitales/docs/CNH_2025.xlsx) (yearly XLSX, joined on CCN)      | Hospital names with their accents, beds, complexes                                  | Adds little to REGCESS for a page; a second yearly file to guard                                                                                                                                        | Nobody: reusable under the same legal notice                      |
| [Catálogo de Centros de Atención Primaria](https://www.sanidad.gob.es/estadEstudios/estadisticas/docs/siap/2026_C_Catal_Centros_AP.xlsx) (yearly XLSX, CCN without its leading zero) | Basic health zone and managing health service of each health centre                 | Useful ("which health centre is mine" needs the zone's streets, which it does not give); kept for a later step                                                                                          | Nobody: reusable under the same legal notice                      |
| REPS, the state register of health professionals                                                                                                                                     | Named professionals, their profession, specialty and workplace                      | No bulk access or reuse licence found; a per-person dataset                                                                                                                                             | Ministerio de Sanidad, DG de Ordenación Profesional: `es-reps.md` |
| Colegios' public registers of members (CGCOM and the provincial colegios)                                                                                                            | Named doctors and dentists, specialty, practice                                     | Public by law for consultation, not licensed for reuse; per-person data                                                                                                                                 | CGCOM: `es-cgcom.md`                                              |
| Coordinates of each centre                                                                                                                                                           | A map pin and exact distances                                                       | REGCESS publishes none; geocoding 115,000 addresses with an open service (CartoCiudad, IGN) is possible but was not tested for licence and accuracy; OpenStreetMap-based geocoders are ODbL share-alike | IGN/CNIG about CartoCiudad's geocoder terms for bulk use          |
| Opening hours, public or concerted network, waiting times                                                                                                                            | When a centre is open, whether the public network pays                              | Not in REGCESS; held by each community's health service                                                                                                                                                 | The 17 health services (one request each)                         |

## How to ask

Information held by a public body may be requested for reuse under Ley 37/2007 on the reuse of
public sector information (amended by Ley 18/2015 and Real Decreto-ley 24/2021, which transposes
the Open Data Directive (EU) 2019/1024), article 10: the body answers within 20 working days,
extendable once (UNVERIFIED on the day: read the consolidated text on boe.es before sending), and
access to information under Ley 19/2013 on transparency, article 17. The professional colegios are
corporations of public law; whether Ley 37/2007 reaches their member registers is doubtful (see
`es-cgcom.md`).

Suggested request, to a community's health service for its centres' opening hours (adapt for the
IGN about bulk geocoding):

> Asunto: Solicitud de reutilización de los horarios de los centros de atención primaria (Ley
> 37/2007, art. 10)
>
> Estimados señores:
>
> Apercura (apercura.org) es un directorio gratuito y de código abierto de centros sanitarios. En
> España publica los centros del Registro General de centros, servicios y establecimientos
> sanitarios (REGCESS, Ministerio de Sanidad), citando la fuente y su fecha de actualización, sin
> valoraciones ni publicidad, y cada página ofrece la posibilidad de solicitar su retirada.
>
> Solicitamos la reutilización de los horarios de atención al público de los centros de salud y
> consultorios de su red, identificados por su código REGCESS, en un formato abierto (CSV o JSON) y
> con su actualización periódica, en las condiciones generales de reutilización o con licencia CC
> BY 4.0.
>
> Quedamos a su disposición para cualquier aclaración.
>
> Atentamente,

Record every answer in the Spain section of [ADR 0002](../adr/0002-multi-country.md#spain-es) and
here.

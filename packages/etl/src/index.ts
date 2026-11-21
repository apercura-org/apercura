export const COMMANDS = ["etl:fr"] as const;

export type Command = (typeof COMMANDS)[number];

export const USAGE = `Usage: apercura-etl <command>

Commands:
  etl:fr    Import French practitioners from the national open data (RPPS / Annuaire Santé).
            Professions are selected with ETL_PROFESSIONS (default: 10,40,50).

Not implemented yet.`;

# Sourced by the Clever Cloud hooks, start command and cron jobs of this folder.
#
# Maps the variables of the linked add-ons to the names Apercura reads, without overriding a
# value set by hand:
#   PostgreSQL: POSTGRESQL_ADDON_URI (owner role) -> DATABASE_URL_MIGRATE, for the migrations only.
#     The app and the import use their own roles (DATABASE_URL, DATABASE_URL_ETL), set by hand.
#   Cellar: CELLAR_ADDON_HOST, CELLAR_ADDON_KEY_ID, CELLAR_ADDON_KEY_SECRET -> S3_*.

if [ -n "${POSTGRESQL_ADDON_URI:-}" ]; then
	export DATABASE_URL_MIGRATE="${DATABASE_URL_MIGRATE:-$POSTGRESQL_ADDON_URI}"
fi

if [ -n "${CELLAR_ADDON_HOST:-}" ]; then
	export S3_ENDPOINT="${S3_ENDPOINT:-https://$CELLAR_ADDON_HOST}"
	export S3_ACCESS_KEY_ID="${S3_ACCESS_KEY_ID:-${CELLAR_ADDON_KEY_ID:-}}"
	export S3_SECRET_ACCESS_KEY="${S3_SECRET_ACCESS_KEY:-${CELLAR_ADDON_KEY_SECRET:-}}"
	# Cellar's documentation signs with the region "default".
	export S3_REGION="${S3_REGION:-default}"
fi

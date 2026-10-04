export const LIBREDB_STUDIO_DEFAULT_IMAGE =
	"ghcr.io/libredb/libredb-studio:0.18.0";

// The first Studio release with launch-token sign-in, the custom-connections
// switch and libSQL Basic auth, which this integration depends on.
export const LIBREDB_STUDIO_MIN_VERSION = "0.18.0";

// Read at install time so air-gapped installs and end-to-end tests can point
// at a private or local registry without a code change.
export const getLibreDBStudioImage = (): string =>
	process.env.LIBREDB_STUDIO_IMAGE?.trim() || LIBREDB_STUDIO_DEFAULT_IMAGE;

export const LIBREDB_STUDIO_PORT = 3000;
export const LIBREDB_STUDIO_CONFIG_DIR = "/app/config";
export const LIBREDB_STUDIO_DATA_DIR = "/app/data";
export const LIBREDB_STUDIO_SEED_FILE = "seed-connections.json";
export const LIBREDB_STUDIO_SEED_TTL_MS = 5000;

// The uid the Studio image runs as. The seed file is made readable for it with
// mode 0644 instead of being chowned, because chown needs root.
export const LIBREDB_STUDIO_CONTAINER_UID = 1001;

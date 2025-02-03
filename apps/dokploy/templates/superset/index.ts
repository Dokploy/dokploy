import {
	type DomainSchema,
	type Schema,
	type Template,
	generatePassword,
	generateRandomDomain,
} from "../utils";

export function generate(schema: Schema): Template {
	const mapboxApiKey = "";
	const secretKey = generatePassword(30);
	const postgresDb = "superset";
	const postgresUser = "superset";
	const postgresPassword = generatePassword(30);
	const redisPassword = generatePassword(30);

	const domains: DomainSchema[] = [
		{
			host: generateRandomDomain(schema),
			port: 8088,
			serviceName: "superset",
		},
	];

	const envs = [
		`SECRET_KEY=${secretKey}`,
		`MAPBOX_API_KEY=${mapboxApiKey}`,
		`POSTGRES_DB=${postgresDb}`,
		`POSTGRES_USER=${postgresUser}`,
		`POSTGRES_PASSWORD=${postgresPassword}`,
		`REDIS_PASSWORD=${redisPassword}`,
	];

	const mounts: Template["mounts"] = [
		{
			filePath: "./superset/superset_config.py",
			content: `
"""
For more configuration options, see:
- https://superset.apache.org/docs/configuration/configuring-superset
"""

import os

SECRET_KEY = os.getenv("SECRET_KEY")
MAPBOX_API_KEY = os.getenv("MAPBOX_API_KEY", "")

CACHE_CONFIG = {
  "CACHE_TYPE": "RedisCache",
  "CACHE_DEFAULT_TIMEOUT": 300,
  "CACHE_KEY_PREFIX": "superset_",
  "CACHE_REDIS_HOST": "redis",
  "CACHE_REDIS_PORT": 6379,
  "CACHE_REDIS_DB": 1,
  "CACHE_REDIS_URL": f"redis://:{os.getenv('REDIS_PASSWORD')}@{os.getenv('REDIS_HOST')}:6379/1",
}

FILTER_STATE_CACHE_CONFIG = {**CACHE_CONFIG, "CACHE_KEY_PREFIX": "superset_filter_"}
EXPLORE_FORM_DATA_CACHE_CONFIG = {**CACHE_CONFIG, "CACHE_KEY_PREFIX": "superset_explore_form_"}

SQLALCHEMY_TRACK_MODIFICATIONS = True
SQLALCHEMY_DATABASE_URI = f"postgresql+psycopg2://{os.getenv('POSTGRES_USER')}:{os.getenv('POSTGRES_PASSWORD')}@{os.getenv('POSTGRES_HOST')}:5432/{os.getenv('POSTGRES_DB')}"

# Uncomment if you want to load example data (using "superset load_examples") at the
# same location as your metadata postgresql instance. Otherwise, the default sqlite
# will be used, which will not persist in volume when restarting superset by default.
#SQLALCHEMY_EXAMPLES_URI = SQLALCHEMY_DATABASE_URI
			`.trim(),
		},
	];

	return {
		envs,
		domains,
		mounts,
	};
}

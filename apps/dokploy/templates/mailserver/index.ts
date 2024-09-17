import type { Schema, Template } from "../utils";

export function generate(schema: Schema): Template {
	const envs = [
		"DMS_HOSTNAME=mail.example.com",
		"DMS_HEALTHCHECK_CMD='ss --listening --tcp | grep -P 'LISTEN.+:smtp' || exit 1'",
		"DMS_HEALTHCHECK_TIMEOUT=3s",
		"DMS_HEALTHCHECK_RETRIES=0",
		"DMS_POSTMASTER_ADDRESS=postmaster@example.com",
		"DMS_DEFAULT_USER=admin@example.com",
		"DMS_DEFAULT_USER_PASS=password",
		"DMS_ENABLE_FAIL2BAN=1",
		"DMS_PERMIT_DOCKER=network",
		"DMS_SPOOF_PROTECTION=0",
		"DMS_SSL_TYPE=letsencrypt",
		"DMS_SSL_DOMAIN=example.com",
	];

	return { envs };
}

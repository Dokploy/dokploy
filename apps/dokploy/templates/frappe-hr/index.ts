import {
	type DomainSchema,
	type Schema,
	type Template,
	generatePassword,
	generateRandomDomain,
} from "../utils";

export function generate(schema: Schema): Template {
	const dbRootPassword = generatePassword(32);
	const adminPassword = generatePassword(32);
	const mainDomain = generateRandomDomain(schema);

	const domains: DomainSchema[] = [
		{
			host: mainDomain,
			port: 8080,
			serviceName: "frontend",
		},
	];

	const envs = [
		`SITE_NAME=${mainDomain}`,
		`ADMIN_PASSWORD=${adminPassword}`,
		`DB_ROOT_PASSWORD=${dbRootPassword}`,
		"MIGRATE=1",
		"ENABLE_DB=1",
		"DB_HOST=db",
		"CREATE_SITE=1",
		"CONFIGURE=1",
		"REGENERATE_APPS_TXT=1",
		"INSTALL_APP_ARGS=--install-app hrms",
		"IMAGE_NAME=ghcr.io/frappe/hrms",
		"VERSION=version-15",
		"FRAPPE_SITE_NAME_HEADER=",
	];

	return { envs, domains };
}

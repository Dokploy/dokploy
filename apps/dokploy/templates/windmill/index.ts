import {
	type DomainSchema,
	type Schema,
	type Template,
	generatePassword,
	generateRandomDomain,
} from "../utils";

export function generate(schema: Schema): Template {
	const mainDomain = generateRandomDomain(schema);
	const postgresPassword = generatePassword();

	const domains: DomainSchema[] = [
		{
			host: mainDomain,
			port: 80,
			serviceName: "windmill-caddy",
		},
	];

	const envs = [
		`WINDMILL_HOST=${mainDomain}`,
		`POSTGRES_PASSWORD=${postgresPassword}`,
		`DATABASE_URL=postgres://postgres:${postgresPassword}@windmill-postgres/windmill?sslmode=disable`,
	];

	const mounts: Template["mounts"] = [
		{
			filePath: "Caddyfile",
			content: `:80 {
    bind 0.0.0.0
    reverse_proxy /ws/* http://windmill-lsp:3001
    reverse_proxy /* http://windmill-server:8000
}`,
		},
	];

	return {
		domains,
		envs,
		mounts,
	};
}

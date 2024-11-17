import {
	type DomainSchema,
	type Schema,
	type Template,
	generateRandomDomain,
} from "../utils";

export function generate(schema: Schema): Template {
	const mainDomain = generateRandomDomain(schema);

	const apiKey = Array.from({ length: 32 }, () =>
		Math.floor(Math.random() * 16).toString(16),
	).join("");
	const encryptionKey = Array.from({ length: 32 }, () =>
		Math.floor(Math.random() * 16).toString(16),
	).join("");
	const jwtSecret = Array.from({ length: 32 }, () =>
		Math.floor(Math.random() * 16).toString(16),
	).join("");
	const postgresPassword = Array.from({ length: 32 }, () =>
		Math.floor(Math.random() * 16).toString(16),
	).join("");

	const domains: DomainSchema[] = [
		{
			host: mainDomain,
			port: 80,
			serviceName: "activepieces",
		},
	];

	const envs = [
		`AP_HOST=${mainDomain}`,
		`AP_API_KEY=${apiKey}`,
		`AP_ENCRYPTION_KEY=${encryptionKey}`,
		`AP_JWT_SECRET=${jwtSecret}`,
		`AP_POSTGRES_PASSWORD=${postgresPassword}`,
	];

	return {
		domains,
		envs,
	};
}

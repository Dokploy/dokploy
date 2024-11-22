import {
	type DomainSchema,
	type Schema,
	type Template,
	generateBase64,
	generatePassword,
	generateRandomDomain,
} from "../utils";

export function generate(schema: Schema): Template {
	const mainDomain = generateRandomDomain(schema);
	const postgresPassword = generatePassword();
	const adminAccessToken = generateBase64(32);

	const domains: DomainSchema[] = [
		{
			host: mainDomain,
			port: 8000,
			serviceName: "ryot-app",
		},
	];

	const envs = [
		`POSTGRES_PASSWORD=${postgresPassword}`,
		`ADMIN_ACCESS_TOKEN=${adminAccessToken}`,
		"# Optional: Uncomment and set your pro key if you have one",
		"# SERVER_PRO_KEY=your_pro_key_here",
	];

	return {
		domains,
		envs,
	};
}

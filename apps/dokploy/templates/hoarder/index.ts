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
	const nextSecret = generateBase64(32);
	const meiliMasterKey = generateBase64(32);

	const domains: DomainSchema[] = [
		{
			host: mainDomain,
			port: 3000,
			serviceName: "web",
		},
	];

	const envs = [
		`NEXTAUTH_SECRET=${nextSecret}`,
		`MEILI_MASTER_KEY=${meiliMasterKey}`,
		`NEXTAUTH_URL=http://${mainDomain}`,
	];

	return {
		domains,
		envs,
	};
}

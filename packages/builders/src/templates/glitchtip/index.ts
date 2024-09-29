import {
	type DomainSchema,
	type Schema,
	type Template,
	generateBase64,
	generateRandomDomain,
} from "../utils";

export function generate(schema: Schema): Template {
	const mainDomain = generateRandomDomain(schema);
	const secretKey = generateBase64(32);

	const domains: DomainSchema[] = [
		{
			host: mainDomain,
			port: 8000,
			serviceName: "web",
		},
	];
	const envs = [
		`GLITCHTIP_HOST=${mainDomain}`,
		"GLITCHTIP_PORT=8000",
		`SECRET_KEY=${secretKey}`,
	];

	return {
		envs,
		domains,
	};
}

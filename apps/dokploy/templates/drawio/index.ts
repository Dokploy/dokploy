import {
	type DomainSchema,
	type Schema,
	type Template,
	generateBase64,
	generateRandomDomain,
} from "../utils";

export function generate(schema: Schema): Template {
	const mainDomain = generateRandomDomain(schema);
	const secretKeyBase = generateBase64(64);

	const domains: DomainSchema[] = [
		{
			host: mainDomain,
			port: 8080,
			serviceName: "drawio",
		},
	];

	const envs = [
		`DRAWIO_HOST=${mainDomain}`,
		`DRAWIO_BASE_URL=https://${mainDomain}`,
		`DRAWIO_SERVER_URL=https://${mainDomain}/`,
	];

	return {
		envs,
		domains,
	};
}

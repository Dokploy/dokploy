import {
	type DomainSchema,
	type Schema,
	type Template,
	generateBase64,
	generateRandomDomain,
} from "@/templates/utils";

export function generate(schema: Schema): Template {
	const randomDomain = generateRandomDomain(schema);
	const secretBase = generateBase64(64);

	const domains: DomainSchema[] = [
		{
			host: randomDomain,
			port: 3000,
			serviceName: "zipline",
		},
	];

	const envs = [
		"ZIPLINE_PORT=3000",
		`ZIPLINE_SECRET=${secretBase}`,
		"ZIPLINE_RETURN_HTTPS=false",
		"ZIPLINE_LOGGER=true",
	];

	return {
		envs,
		domains,
	};
}

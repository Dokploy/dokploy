import {
	type DomainSchema,
	type Schema,
	type Template,
	generateBase64,
	generateRandomDomain,
} from "../utils";

export function generate(schema: Schema): Template {
	const randomDomain = generateRandomDomain(schema);
	const randomSecret = generateBase64();

	const domains: DomainSchema[] = [
		{
			host: randomDomain,
			port: 3000,
			serviceName: "umami",
		},
	];

	const envs = [`APP_SECRET=${randomSecret}`];

	return {
		envs,
		domains,
	};
}

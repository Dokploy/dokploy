import {
	type DomainSchema,
	type Schema,
	type Template,
	generateBase64,
	generateRandomDomain,
} from "../utils";

export function generate(schema: Schema): Template {
	const mainDomain = generateRandomDomain(schema);
	const masterKey = generateBase64(32);

	const domains: DomainSchema[] = [
		{
			host: mainDomain,
			port: 7700,
			serviceName: "meilisearch",
		},
	];
	const envs = ["MEILI_ENV=development", `MEILI_MASTER_KEY=${masterKey}`];

	return {
		envs,
		domains,
	};
}

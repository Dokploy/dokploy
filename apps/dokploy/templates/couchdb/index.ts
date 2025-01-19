import {
	type DomainSchema,
	type Schema,
	type Template,
	generatePassword,
	generateRandomDomain,
} from "../utils";

export function generate(schema: Schema): Template {
	const mainDomain = generateRandomDomain(schema);
	const username = generatePassword(16);
	const password = generatePassword(32);

	const domains: DomainSchema[] = [
		{
			serviceName: "couchdb",
			host: mainDomain,
			port: 5984,
		},
	];

	const envs = [`COUCHDB_USER=${username}`, `COUCHDB_PASSWORD=${password}`];

	return {
		envs,
		domains,
	};
}

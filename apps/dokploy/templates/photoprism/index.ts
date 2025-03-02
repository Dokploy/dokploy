import {
	type DomainSchema,
	type Schema,
	type Template,
	generateHash,
	generatePassword,
	generateRandomDomain,
} from "../utils";

export function generate(schema: Schema): Template {
	const randomDomain = generateRandomDomain(schema);
	const randomPassword = generatePassword();

	const domains: DomainSchema[] = [
		{
			host: randomDomain,
			port: 2342,
			serviceName: "photoprism",
		},
	];

	const envs = [
		`BASE_URL=http://${randomDomain}`,
		`ADMIN_PASSWORD=${randomPassword}`,
	];

	return {
		envs,
		domains,
	};
}

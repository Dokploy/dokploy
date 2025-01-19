import {
	type DomainSchema,
	type Schema,
	type Template,
	generatePassword,
	generateRandomDomain,
} from "../utils";

export function generate(schema: Schema): Template {
	const matrixSubdomain = generateRandomDomain(schema);
	const registrationToken = generatePassword(20);

	const domains: DomainSchema[] = [
		{
			host: matrixSubdomain,
			port: 6167,
			serviceName: "homeserver",
		},
	];

	const envs = [
		`CONDUWUIT_SERVER_NAME=${matrixSubdomain}`,
		`CONDUWUIT_REGISTRATION_TOKEN=${registrationToken}`,
	];

	return {
		envs,
		domains,
	};
}

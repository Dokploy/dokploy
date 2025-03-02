import {
	type DomainSchema,
	type Schema,
	type Template,
	generatePassword,
	generateRandomDomain,
} from "../utils";

export function generate(schema: Schema): Template {
	const mainDomain = generateRandomDomain(schema);
	const secretKey = generatePassword(64);

	const domains: DomainSchema[] = [
		{
			host: mainDomain,
			port: 7575,
			serviceName: "homarr",
		},
	];

	const envs = [`SECRET_ENCRYPTION_KEY=${secretKey}`];

	return {
		domains,
		envs,
	};
}

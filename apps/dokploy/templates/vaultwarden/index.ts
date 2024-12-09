import {
	type DomainSchema,
	type Schema,
	type Template,
	generateRandomDomain,
} from "../utils";

export function generate(schema: Schema): Template {
	const domains: DomainSchema[] = [
		{
			host: generateRandomDomain(schema),
			port: 80,
			serviceName: "vaultwarden",
		},
	];

	const envs = [
		"# Deactivate this with 'false' after you have created your account so that no strangers can register",
		"SIGNUPS_ALLOWED=true",
		"# required when using a reverse proxy; your domain; vaultwarden needs to know it's https to work properly with attachments",
		"DOMAIN=https://vaultwarden.example.com",
	];

	return {
		domains,
		envs,
	};
}

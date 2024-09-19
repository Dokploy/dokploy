import {
	type DomainSchema,
	type Schema,
	type Template,
	generateRandomDomain,
} from "../utils";

export function generate(schema: Schema): Template {
	const randomDomain = generateRandomDomain(schema);
	const envs = [
		"DEFAULT_HOST=tls://mail.example.com",
		"SMTP_SERVER=tls://mail.example.com",
	];

	const domains: DomainSchema[] = [
		{
			host: randomDomain,
			port: 80,
			serviceName: "roundcubemail",
		},
	];

	return { envs, domains };
}

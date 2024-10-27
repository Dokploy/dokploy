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
			serviceName: "all-in-one",
		},
	];

	const envs = [
		"# change domain here",
		"DOMAIN=my-events.com",
		"",
		"POSTGRES_DB=hievents",
		"POSTGRES_USER=hievents",
		"POSTGRES_PASSWORD=VERY_STRONG_PASSWORD",
		"",
		"VITE_STRIPE_PUBLISHABLE_KEY=",
		"",
		"APP_KEY=my-app-key",
		"JWT_SECRET=STRONG_JWT_SECRET",
		"",
		"MAIL_MAILER=",
		"MAIL_HOST=",
		"MAIL_PORT=",
		"MAIL_FROM_ADDRESS=",
		"MAIL_FROM_NAME=",
	];

	return {
		domains,
		envs,
	};
}

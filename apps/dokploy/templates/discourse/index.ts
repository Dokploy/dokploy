import {
	type DomainSchema,
	type Schema,
	type Template,
	generatePassword,
	generateRandomDomain,
} from "../utils";

export function generate(schema: Schema): Template {
	const mainDomain = generateRandomDomain(schema);
	const postgresPassword = generatePassword();
	const redisPassword = generatePassword();

	const domains: DomainSchema[] = [
		{
			host: mainDomain,
			port: 3000,
			serviceName: "discourse-app",
		},
	];

	const envs = [
		`DISCOURSE_HOST=${mainDomain}`,
		`POSTGRES_PASSWORD=${postgresPassword}`,
		`REDIS_PASSWORD=${redisPassword}`,
		"# Optional: Configure SMTP for email delivery",
		"# SMTP_HOST=smtp.example.com",
		"# SMTP_PORT=587",
		"# SMTP_USER=your_smtp_user",
		"# SMTP_PASSWORD=your_smtp_password",
	];

	return {
		domains,
		envs,
	};
}

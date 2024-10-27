import {
	type DomainSchema,
	type Schema,
	type Template,
	generateBase64,
	generateRandomDomain,
} from "../utils";

export function generate(schema: Schema): Template {
	const mainDomain = generateRandomDomain(schema);
	const jwtSecret = generateBase64(32);

	const domains: DomainSchema[] = [
		{
			host: mainDomain,
			port: 8080,
			serviceName: "app",
		},
	];

	const envs = [
		`TOLGEE_HOST=${mainDomain}`,
		"TOLGEE_AUTHENTICATION_ENABLED=true",
		"TOLGEE_AUTHENTICATION_INITIAL_PASSWORD=admin",
		"TOLGEE_AUTHENTICATION_INITIAL_USERNAME=admin",
		`TOLGEE_AUTHENTICATION_JWT_SECRET=${jwtSecret}`,
		"TOLGEE_MACHINE_TRANSLATION_GOOGLE_API_KEY=my_google_api_key",
		"TOLGEE_SMTP_AUTH=true",
		"TOLGEE_SMTP_FROM=Tolgee <no-reply@mydomain.com>",
		"TOLGEE_SMTPHOST=email-smtp.regional-region.amazonaws.com",
		"TOLGEE_SMTP_PASSWORD=omg/my/password",
		"TOLGEE_SMTP_PORT=465",
		"TOLGEE_SMTP_SSL_ENABLED=true",
		"TOLGEE_SMTP_USERNAME=user@company.com",
	];

	return {
		envs,
		domains,
	};
}

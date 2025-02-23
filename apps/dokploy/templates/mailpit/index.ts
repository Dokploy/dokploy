import {
	type DomainSchema,
	type Schema,
	type Template,
	generateBase64,
	generatePassword,
	generateRandomDomain,
} from "../utils";

export function generate(schema: Schema): Template {
	const domains: DomainSchema[] = [
		{
			host: generateRandomDomain(schema),
			port: 8025,
			serviceName: "mailpit",
		},
	];

	const defaultPassword = generatePassword();

	const envs = [
		"# Uncomment below if you want basic auth on UI and SMTP",
		`#MP_UI_AUTH=mailpit:${defaultPassword}`,
		`#MP_SMTP_AUTH=mailpit:${defaultPassword}`,
	];

	return {
		domains,
		envs,
	};
}

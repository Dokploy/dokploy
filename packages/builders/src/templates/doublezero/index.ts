import {
	type DomainSchema,
	type Schema,
	type Template,
	generateBase64,
	generateRandomDomain,
} from "../utils";

export function generate(schema: Schema): Template {
	const mainDomain = generateRandomDomain(schema);
	const secretKeyBase = generateBase64(64);

	const domains: DomainSchema[] = [
		{
			host: mainDomain,
			port: 4000,
			serviceName: "doublezero",
		},
	];

	const envs = [
		`DOUBLEZERO_HOST=${mainDomain}`,
		"DOUBLEZERO_PORT=4000",
		`SECRET_KEY_BASE=${secretKeyBase}`,
		"AWS_ACCESS_KEY_ID=your-aws-access-key",
		"AWS_SECRET_ACCESS_KEY=your-aws-secret-key",
		"AWS_REGION=your-aws-region",
		"SQS_URL=your-aws-sqs-url",
		"SYSTEM_EMAIL=",
	];

	return {
		envs,
		domains,
	};
}

import {
	type DomainSchema,
	type Schema,
	type Template,
	generateBase64,
	generateRandomDomain,
} from "../utils";

export function generate(schema: Schema): Template {
	const mainDomain = generateRandomDomain(schema);
	const secretBase = generateBase64(64);
	const encryptionKey = generateBase64(48);
	const cronSecret = generateBase64(32);

	const domains: DomainSchema[] = [
		{
			host: mainDomain,
			port: 3000,
			serviceName: "formbricks",
		},
	];

	const envs = [
		`WEBAPP_URL=http://${mainDomain}`,
		`NEXTAUTH_URL=http://${mainDomain}`,
		`NEXTAUTH_SECRET=${secretBase}`,
		`ENCRYPTION_KEY=${encryptionKey}`,
		`CRON_SECRET=${cronSecret}`,
	];

	const mounts: Template["mounts"] = [];

	return {
		envs,
		mounts,
		domains,
	};
}

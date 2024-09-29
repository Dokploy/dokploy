import {
	type DomainSchema,
	type Schema,
	type Template,
	generateBase64,
	generateRandomDomain,
} from "../utils";

export function generate(schema: Schema): Template {
	const builderDomain = generateRandomDomain(schema);
	const viewerDomain = generateRandomDomain(schema);
	const encryptionSecret = generateBase64(24);

	const domains: DomainSchema[] = [
		{
			host: builderDomain,
			port: 3000,
			serviceName: "typebot-builder",
		},
		{
			host: viewerDomain,
			port: 3000,
			serviceName: "typebot-viewer",
		},
	];

	const envs = [
		`ENCRYPTION_SECRET=${encryptionSecret}`,
		`NEXTAUTH_URL=http://${builderDomain}`,
		`NEXT_PUBLIC_VIEWER_URL=http://${viewerDomain}`,
		"ADMIN_EMAIL=typebot@example.com",
		"SMTP_HOST='Fill'",
		"SMTP_PORT=25",
		"SMTP_USERNAME='Fill'",
		"SMTP_PASSWORD='Fill'",
		"NEXT_PUBLIC_SMTP_FROM=typebot@example.com",
		"DEFAULT_WORKSPACE_PLAN=UNLIMITED",
	];

	return {
		envs,
		domains,
	};
}

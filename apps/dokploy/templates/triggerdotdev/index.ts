import { Secrets } from "@/components/ui/secrets";
import {
	type DomainSchema,
	type Schema,
	type Template,
	generateBase64,
	generateRandomDomain,
} from "../utils";

export function generate(schema: Schema): Template {
	const triggerDomain = generateRandomDomain(schema);

	const magicLinkSecret = generateBase64(16);
	const sessionSecret = generateBase64(16);
	const encryptionKey = generateBase64(32);
	const providerSecret = generateBase64(32);
	const coordinatorSecret = generateBase64(32);

	const dbPassword = generateBase64(24);
	const dbUser = "triggeruser";
	const dbName = "triggerdb";

	const domains: DomainSchema[] = [
		{
			host: triggerDomain,
			port: 3000,
			serviceName: "webapp",
		},
	];

	const envs = [
		"NODE_ENV=production",
		"RUNTIME_PLATFORM=docker-compose",
		"V3_ENABLED=true",

		"# Domain configuration",
		`TRIGGER_DOMAIN=${triggerDomain}`,
		"TRIGGER_PROTOCOL=http",

		"# Database configuration with secure credentials",
		`POSTGRES_USER=${dbUser}`,
		`POSTGRES_PASSWORD=${dbPassword}`,
		`POSTGRES_DB=${dbName}`,
		`DATABASE_URL=postgresql://${dbUser}:${dbPassword}@postgres:5432/${dbName}`,

		"# Secrets",
		`MAGIC_LINK_SECRET=${magicLinkSecret}`,
		`SESSION_SECRET=${sessionSecret}`,
		`ENCRYPTION_KEY=${encryptionKey}`,
		`PROVIDER_SECRET=${providerSecret}`,
		`COORDINATOR_SECRET=${coordinatorSecret}`,

		"# TRIGGER_TELEMETRY_DISABLED=1",
		"INTERNAL_OTEL_TRACE_DISABLED=1",
		"INTERNAL_OTEL_TRACE_LOGGING_ENABLED=0",

		"DEFAULT_ORG_EXECUTION_CONCURRENCY_LIMIT=300",
		"DEFAULT_ENV_EXECUTION_CONCURRENCY_LIMIT=100",

		"DIRECT_URL=${DATABASE_URL}",
		"REDIS_HOST=redis",
		"REDIS_PORT=6379",
		"REDIS_TLS_DISABLED=true",

		"# If this is set, emails that are not specified won't be able to log in",
		'# WHITELISTED_EMAILS="authorized@yahoo.com|authorized@gmail.com"',
		"# Accounts with these emails will become admins when signing up and get access to the admin panel",
		'# ADMIN_EMAILS="admin@example.com|another-admin@example.com"',

		"# If this is set, your users will be able to log in via GitHub",
		"# AUTH_GITHUB_CLIENT_ID=",
		"# AUTH_GITHUB_CLIENT_SECRET=",

		"# E-mail settings",
		"# Ensure the FROM_EMAIL matches what you setup with Resend.com",
		"# If these are not set, emails will be printed to the console",
		"# FROM_EMAIL=",
		"# REPLY_TO_EMAIL=",
		"# RESEND_API_KEY=",

		"# Worker settings",
		"HTTP_SERVER_PORT=9020",
		"COORDINATOR_HOST=127.0.0.1",
		"COORDINATOR_PORT=${HTTP_SERVER_PORT}",
		"# REGISTRY_HOST=${DEPLOY_REGISTRY_HOST}",
		"# REGISTRY_NAMESPACE=${DEPLOY_REGISTRY_NAMESPACE}",
	];

	return {
		envs,
		domains,
	};
}

import {
	type DomainSchema,
	type Schema,
	type Template,
	generateBase64,
	generateHash,
	generateRandomDomain,
} from "../utils";

export function generate(schema: Schema): Template {
	const mainDomain = generateRandomDomain(schema);
	const secretBase = generateBase64(64);

	const domains: DomainSchema[] = [
		{
			host: mainDomain,
			port: 3000,
			serviceName: "unsend",
		},
	];

	const envs = [
		"REDIS_URL=redis://unsend-redis-prod:6379",
		"POSTGRES_USER=postgres",
		"POSTGRES_PASSWORD=postgres",
		"POSTGRES_DB=unsend",
		"DATABASE_URL=postgresql://postgres:postgres@unsend-db-prod:5432/unsend",
		"NEXTAUTH_URL=http://localhost:3000",
		`NEXTAUTH_SECRET=${secretBase}`,
		"GITHUB_ID='Fill'",
		"GITHUB_SECRET='Fill'",
		"AWS_DEFAULT_REGION=us-east-1",
		"AWS_SECRET_KEY='Fill'",
		"AWS_ACCESS_KEY='Fill'",
		"DOCKER_OUTPUT=1",
		"API_RATE_LIMIT=1",
		"DISCORD_WEBHOOK_URL=",
	];

	return {
		envs,
		domains,
	};
}

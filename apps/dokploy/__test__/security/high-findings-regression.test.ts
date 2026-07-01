import { readFileSync } from "node:fs";
import {
	apiUpdateApplication,
	apiUpdateCompose,
	apiUpdateLibsql,
	apiUpdateMariaDB,
	apiUpdateMongo,
	apiUpdateMySql,
	apiUpdatePostgres,
	apiUpdateRedis,
	apiUpdateUser,
} from "@dokploy/server/db/schema";
import { domain, domainCompose } from "@dokploy/server/db/validations/domain";
import { describe, expect, it } from "vitest";

describe("high-severity schema security boundaries", () => {
	it("allows only explicit self-service user profile fields", () => {
		expect(
			apiUpdateUser.safeParse({
				email: "user@example.com",
				firstName: "Ada",
				lastName: "Lovelace",
				image: null,
				allowImpersonation: true,
			}).success,
		).toBe(true);

		for (const payload of [
			{ enablePaidFeatures: true },
			{ enableEnterpriseFeatures: true },
			{ serversQuantity: 100 },
			{ role: "admin" },
			{ stripeSubscriptionId: "sub_123" },
		]) {
			expect(apiUpdateUser.safeParse(payload).success).toBe(false);
		}
	});

	it("strips environmentId from generic service update schemas", () => {
		const cases = [
			{
				schema: apiUpdateApplication,
				payload: {
					applicationId: "app-1",
					environmentId: "env-2",
					refreshToken: "caller-chosen-token",
				},
			},
			{
				schema: apiUpdateCompose,
				payload: {
					composeId: "compose-1",
					environmentId: "env-2",
					refreshToken: "caller-chosen-token",
				},
			},
			{
				schema: apiUpdatePostgres,
				payload: { postgresId: "postgres-1", environmentId: "env-2" },
			},
			{
				schema: apiUpdateMySql,
				payload: { mysqlId: "mysql-1", environmentId: "env-2" },
			},
			{
				schema: apiUpdateMariaDB,
				payload: { mariadbId: "mariadb-1", environmentId: "env-2" },
			},
			{
				schema: apiUpdateMongo,
				payload: { mongoId: "mongo-1", environmentId: "env-2" },
			},
			{
				schema: apiUpdateRedis,
				payload: { redisId: "redis-1", environmentId: "env-2" },
			},
			{
				schema: apiUpdateLibsql,
				payload: { libsqlId: "libsql-1", environmentId: "env-2" },
			},
		];

		for (const { schema, payload } of cases) {
			const parsed = schema.safeParse(payload);
			expect(parsed.success).toBe(true);
			if (parsed.success) {
				expect(parsed.data).not.toHaveProperty("environmentId");
				expect(parsed.data).not.toHaveProperty("refreshToken");
			}
		}
	});

	it("rejects Traefik rule syntax in domain host and path fields", () => {
		expect(
			domain.safeParse({
				host: "example.com",
				path: "/api",
				internalPath: "/internal",
			}).success,
		).toBe(true);
		expect(domain.safeParse({ host: "тест.рф", path: "/" }).success).toBe(true);
		expect(domain.safeParse({ host: "*.example.com", path: "/" }).success).toBe(
			true,
		);
		expect(
			domain.safeParse({ host: "example.com`) || Host(`evil.example" }).success,
		).toBe(false);
		expect(
			domain.safeParse({
				host: "example.com",
				path: "/api`) || Host(`evil.example",
			}).success,
		).toBe(false);
		expect(
			domain.safeParse({
				host: "example.com",
				internalPath: "internal",
			}).success,
		).toBe(false);
	});

	it("rejects unsafe custom Traefik identifiers on domain configuration", () => {
		expect(
			domain.safeParse({
				host: "example.com",
				path: "/",
				https: true,
				certificateType: "custom",
				customEntrypoint: "websecure-custom",
				customCertResolver: "team.resolver_1",
				middlewares: ["auth@file", "rate-limit"],
			}).success,
		).toBe(true);

		for (const payload of [
			{ customEntrypoint: "web,websecure" },
			{ customEntrypoint: "web secure" },
			{ customCertResolver: "letsencrypt@docker" },
			{ customCertResolver: "resolver`bad" },
			{ middlewares: ["auth@docker"] },
			{ middlewares: ["auth@file,evil@file"] },
			{ middlewares: [" auth@file"] },
			{ middlewares: ["auth;evil@file"] },
		]) {
			expect(
				domain.safeParse({
					host: "example.com",
					path: "/",
					...payload,
				}).success,
			).toBe(false);
		}

		expect(
			domain.safeParse({
				host: "example.com",
				path: "/",
				customEntrypoint: "",
				customCertResolver: "",
				middlewares: ["", "auth@file"],
			}).success,
		).toBe(true);
	});

	it("applies the same Traefik rule validation to compose domains", () => {
		expect(
			domainCompose.safeParse({
				host: "compose.example.com",
				path: "/api",
				serviceName: "web",
			}).success,
		).toBe(true);
		expect(
			domainCompose.safeParse({
				host: "compose.example.com",
				path: "/api`) || Host(`evil.example",
				serviceName: "web",
			}).success,
		).toBe(false);
		expect(
			domainCompose.safeParse({
				host: "compose.example.com",
				path: "/api",
				serviceName: "web",
				customEntrypoint: "private.entrypoint",
				customCertResolver: "resolver-1",
				middlewares: ["compose-auth@file"],
			}).success,
		).toBe(true);
		expect(
			domainCompose.safeParse({
				host: "compose.example.com",
				path: "/api",
				serviceName: "web",
				customEntrypoint: "private,web",
			}).success,
		).toBe(false);
		expect(
			domainCompose.safeParse({
				host: "compose.example.com",
				path: "/api",
				serviceName: "web",
				middlewares: ["compose-auth@docker"],
			}).success,
		).toBe(false);
	});

	it("keeps host-level schedule scope cleanup in a forward migration", () => {
		const historicalMigration = readFileSync(
			new URL("../../drizzle/0169_parched_johnny_storm.sql", import.meta.url),
			"utf8",
		);
		const cleanupMigration = readFileSync(
			new URL(
				"../../drizzle/0175_guard_host_schedule_scope.sql",
				import.meta.url,
			),
			"utf8",
		);

		expect(historicalMigration).toContain('FROM "member" m');
		expect(historicalMigration).not.toContain("owner_memberships");
		expect(historicalMigration).not.toContain('SET "enabled" = false');
		expect(cleanupMigration).toContain("ambiguous_owner_orgs");
		expect(cleanupMigration).toContain(
			'HAVING count(DISTINCT "organization_id") > 1',
		);
		expect(cleanupMigration).toContain('SET "enabled" = false');
		expect(cleanupMigration).toContain('"organizationId" IS NULL');
	});
});

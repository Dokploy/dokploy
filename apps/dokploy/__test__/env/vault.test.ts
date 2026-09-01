import { beforeEach, describe, expect, it, vi } from "vitest";

const findMany = vi.fn();

vi.mock("@dokploy/server/db", () => ({
	db: {
		query: {
			vaultProvider: {
				findMany: (...args: unknown[]) => findMany(...args),
			},
		},
	},
}));

import { prepareEnvironmentVariables } from "@dokploy/server/utils/docker/utils";
import {
	resolveVaultReferences,
	withResolvedVaultRefs,
} from "@dokploy/server/utils/vault";
import { azureClient } from "@dokploy/server/utils/vault/azure";
import { dopplerClient } from "@dokploy/server/utils/vault/doppler";
import { hashicorpClient } from "@dokploy/server/utils/vault/hashicorp";
import { phaseClient } from "@dokploy/server/utils/vault/phase";
import { scalewayClient } from "@dokploy/server/utils/vault/scaleway";

const mockFetch = vi.fn();
global.fetch = mockFetch as typeof fetch;

const jsonResponse = (body: unknown, ok = true, status = 200) =>
	({
		ok,
		status,
		json: async () => body,
	}) as Response;

beforeEach(() => {
	findMany.mockReset();
	mockFetch.mockReset();
});

const scope = {
	organizationId: "org-1",
	projectId: "proj-1",
	environmentId: "env-1",
};

const assignedEverywhere = [{ projectId: "proj-1", environmentIds: [] }];

describe("resolveVaultReferences", () => {
	it("returns input untouched and skips the db when no refs are present", async () => {
		const env = "FOO=bar\nBAZ=${{project.QUX}}";
		const result = await resolveVaultReferences(env, scope);
		expect(result).toBe(env);
		expect(findMany).not.toHaveBeenCalled();
	});

	it("returns null/empty inputs unchanged", async () => {
		expect(await resolveVaultReferences(null, scope)).toBeNull();
		expect(await resolveVaultReferences("", scope)).toBe("");
	});

	it("throws when refs exist but no organization context is given", async () => {
		await expect(
			resolveVaultReferences("FOO=${{vault.prod.SECRET}}"),
		).rejects.toThrow("not supported in this context");
	});

	it("throws for an unknown provider", async () => {
		findMany.mockResolvedValue([]);
		await expect(
			resolveVaultReferences("FOO=${{vault.missing.SECRET}}", scope),
		).rejects.toThrow('Vault provider "missing" not found');
	});

	it("throws when the provider is not assigned to the project", async () => {
		findMany.mockResolvedValue([
			{
				name: "prod",
				providerType: "doppler",
				config: { providerType: "doppler", serviceToken: "dp.st.token" },
				assignments: [{ projectId: "other-project", environmentIds: [] }],
			},
		]);
		await expect(
			resolveVaultReferences("FOO=${{vault.prod.SECRET}}", scope),
		).rejects.toThrow("not enabled for this project/environment");
	});

	it("throws when the provider is restricted to another environment", async () => {
		findMany.mockResolvedValue([
			{
				name: "prod",
				providerType: "doppler",
				config: { providerType: "doppler", serviceToken: "dp.st.token" },
				assignments: [
					{ projectId: "proj-1", environmentIds: ["production-env"] },
				],
			},
		]);
		await expect(
			resolveVaultReferences("FOO=${{vault.prod.SECRET}}", scope),
		).rejects.toThrow("not enabled for this project/environment");
	});

	it("allows a provider restricted to the matching environment", async () => {
		findMany.mockResolvedValue([
			{
				name: "prod",
				providerType: "doppler",
				config: { providerType: "doppler", serviceToken: "dp.st.token" },
				assignments: [{ projectId: "proj-1", environmentIds: ["env-1"] }],
			},
		]);
		mockFetch.mockResolvedValue(jsonResponse({ SECRET: "value-1" }));
		const result = await resolveVaultReferences(
			"FOO=${{vault.prod.SECRET}}",
			scope,
		);
		expect(result).toBe("FOO=value-1");
	});

	it("resolves refs through a doppler provider", async () => {
		findMany.mockResolvedValue([
			{
				name: "doppler-prod",
				providerType: "doppler",
				config: { providerType: "doppler", serviceToken: "dp.st.token" },
				assignments: assignedEverywhere,
			},
		]);
		mockFetch.mockResolvedValue(
			jsonResponse({ DB_URL: "postgres://real", API_KEY: "key-123" }),
		);

		const result = await resolveVaultReferences(
			"DB_URL=${{vault.doppler-prod.DB_URL}}\nAPI_KEY=${{vault.doppler-prod.API_KEY}}",
			scope,
		);

		expect(result).toBe("DB_URL=postgres://real\nAPI_KEY=key-123");
		expect(mockFetch).toHaveBeenCalledTimes(1);
	});

	it("throws when the secret is missing in the provider", async () => {
		findMany.mockResolvedValue([
			{
				name: "doppler-prod",
				providerType: "doppler",
				config: { providerType: "doppler", serviceToken: "dp.st.token" },
				assignments: assignedEverywhere,
			},
		]);
		mockFetch.mockResolvedValue(jsonResponse({ OTHER: "x" }));

		await expect(
			resolveVaultReferences("FOO=${{vault.doppler-prod.MISSING}}", scope),
		).rejects.toThrow('secret "MISSING" not found');
	});
});

describe("withResolvedVaultRefs + prepareEnvironmentVariables", () => {
	it("resolves entity env sources so sync interpolation sees real values", async () => {
		findMany.mockResolvedValue([
			{
				name: "prod",
				providerType: "doppler",
				config: { providerType: "doppler", serviceToken: "dp.st.token" },
				assignments: assignedEverywhere,
			},
		]);
		mockFetch.mockResolvedValue(jsonResponse({ DB_PASSWORD: "s3cret" }));

		const entity = {
			env: "DATABASE_URL=postgres://user:${{project.DB_PASSWORD}}@db",
			environment: {
				environmentId: "env-1",
				env: null,
				project: {
					projectId: "proj-1",
					env: "DB_PASSWORD=${{vault.prod.DB_PASSWORD}}",
					organizationId: "org-1",
				},
			},
		};

		const resolved = await withResolvedVaultRefs(entity);
		const prepared = prepareEnvironmentVariables(
			resolved.env,
			resolved.environment.project.env,
			resolved.environment.env,
		);

		expect(prepared).toEqual(["DATABASE_URL=postgres://user:s3cret@db"]);
	});

	it("resolves buildArgs and buildSecrets when present", async () => {
		findMany.mockResolvedValue([
			{
				name: "prod",
				providerType: "doppler",
				config: { providerType: "doppler", serviceToken: "dp.st.token" },
				assignments: assignedEverywhere,
			},
		]);
		mockFetch.mockResolvedValue(jsonResponse({ NPM_TOKEN: "npm-123" }));

		const resolved = await withResolvedVaultRefs({
			env: "FOO=bar",
			buildArgs: "NPM_TOKEN=${{vault.prod.NPM_TOKEN}}",
			buildSecrets: null,
			environment: {
				environmentId: "env-1",
				env: null,
				project: { projectId: "proj-1", env: null, organizationId: "org-1" },
			},
		});

		expect(resolved.buildArgs).toBe("NPM_TOKEN=npm-123");
		expect(resolved.buildSecrets).toBeNull();
		expect(resolved.env).toBe("FOO=bar");
	});

	it.each([
		["service env", { env: "SECRET=${{vault.locked.X}}" }],
		["environment env", { environmentEnv: "SECRET=${{vault.locked.X}}" }],
		["project env", { projectEnv: "SECRET=${{vault.locked.X}}" }],
		["build args", { buildArgs: "SECRET=${{vault.locked.X}}" }],
	])(
		"rejects a ref to an unassigned provider placed in the %s",
		async (_source, overrides) => {
			findMany.mockResolvedValue([
				{
					name: "locked",
					providerType: "doppler",
					config: { providerType: "doppler", serviceToken: "dp.st.token" },
					assignments: [{ projectId: "other-project", environmentIds: [] }],
				},
			]);

			const entity = {
				env: (overrides as { env?: string }).env ?? "FOO=bar",
				buildArgs: (overrides as { buildArgs?: string }).buildArgs ?? null,
				environment: {
					environmentId: "env-1",
					env:
						(overrides as { environmentEnv?: string }).environmentEnv ?? null,
					project: {
						projectId: "proj-1",
						env: (overrides as { projectEnv?: string }).projectEnv ?? null,
						organizationId: "org-1",
					},
				},
			};

			await expect(withResolvedVaultRefs(entity)).rejects.toThrow(
				"not enabled for this project/environment",
			);
			expect(mockFetch).not.toHaveBeenCalled();
		},
	);

	it("rejects a ref restricted to another environment from the environment env", async () => {
		findMany.mockResolvedValue([
			{
				name: "prod-only",
				providerType: "doppler",
				config: { providerType: "doppler", serviceToken: "dp.st.token" },
				assignments: [
					{ projectId: "proj-1", environmentIds: ["production-env"] },
				],
			},
		]);

		await expect(
			withResolvedVaultRefs({
				env: null,
				environment: {
					environmentId: "dev-env",
					env: "SECRET=${{vault.prod-only.X}}",
					project: { projectId: "proj-1", env: null, organizationId: "org-1" },
				},
			}),
		).rejects.toThrow("not enabled for this project/environment");
		expect(mockFetch).not.toHaveBeenCalled();
	});

	it("prepareEnvironmentVariables throws on unresolved vault refs", () => {
		expect(() =>
			prepareEnvironmentVariables("FOO=${{vault.prod.SECRET}}", "", ""),
		).toThrow("Unresolved vault reference");
	});

	it("keeps working without vault refs", () => {
		const prepared = prepareEnvironmentVariables(
			"FOO=${{project.BAR}}",
			"BAR=baz",
		);
		expect(prepared).toEqual(["FOO=baz"]);
		expect(findMany).not.toHaveBeenCalled();
	});
});

describe("hashicorp client", () => {
	const config = {
		providerType: "hashicorp" as const,
		url: "https://vault.example.com",
		token: "hvs.token",
		mount: "secret",
	};

	it("rejects refs without a field", async () => {
		await expect(
			hashicorpClient.getSecrets(config, ["myapp/prod"]),
		).rejects.toThrow("expected format <path>:<field>");
	});

	it("groups refs by path and picks fields from KV v2 data", async () => {
		mockFetch.mockResolvedValue(
			jsonResponse({ data: { data: { USER: "admin", PASS: "pw" } } }),
		);

		const result = await hashicorpClient.getSecrets(config, [
			"myapp/prod:USER",
			"myapp/prod:PASS",
		]);

		expect(result).toEqual({
			"myapp/prod:USER": "admin",
			"myapp/prod:PASS": "pw",
		});
		expect(mockFetch).toHaveBeenCalledTimes(1);
		expect(mockFetch.mock.calls[0]?.[0]).toBe(
			"https://vault.example.com/v1/secret/data/myapp/prod",
		);
	});

	it("throws when a field is missing", async () => {
		mockFetch.mockResolvedValue(jsonResponse({ data: { data: { A: "1" } } }));
		await expect(
			hashicorpClient.getSecrets(config, ["myapp/prod:MISSING"]),
		).rejects.toThrow('field "MISSING" not found');
	});

	it("lists full path:field refs by walking directories", async () => {
		mockFetch.mockImplementation(async (url: string) => {
			if (url.includes("/metadata?list=true")) {
				return jsonResponse({ data: { keys: ["myapp/", "shared"] } });
			}
			if (url.includes("/metadata/myapp?list=true")) {
				return jsonResponse({ data: { keys: ["prod"] } });
			}
			if (url.includes("/data/myapp/prod")) {
				return jsonResponse({
					data: { data: { API_KEY: "a", DB_PASSWORD: "b" } },
				});
			}
			if (url.includes("/data/shared")) {
				return jsonResponse({ data: { data: { STRIPE_KEY: "c" } } });
			}
			return jsonResponse({}, false, 404);
		});

		const names = await hashicorpClient.listSecretNames?.(config);

		expect(names).toEqual([
			"myapp/prod:API_KEY",
			"myapp/prod:DB_PASSWORD",
			"shared:STRIPE_KEY",
		]);
	});
});

describe("azure client", () => {
	const config = {
		providerType: "azure" as const,
		vaultUri: "https://my-vault.vault.azure.net",
		tenantId: "tenant-1",
		clientId: "client-1",
		clientSecret: "secret-1",
	};

	it("authenticates and reads secrets by name", async () => {
		mockFetch.mockImplementation(async (url: string) => {
			if (url.includes("login.microsoftonline.com/tenant-1")) {
				return jsonResponse({ access_token: "azure-token" });
			}
			if (url.includes("/secrets/db-password?")) {
				return jsonResponse({ value: "azure-pw" });
			}
			return jsonResponse({}, false, 404);
		});

		const result = await azureClient.getSecrets(config, ["db-password"]);

		expect(result).toEqual({ "db-password": "azure-pw" });
	});

	it("throws a clear error for missing secrets", async () => {
		mockFetch.mockImplementation(async (url: string) => {
			if (url.includes("login.microsoftonline.com")) {
				return jsonResponse({ access_token: "azure-token" });
			}
			return jsonResponse({}, false, 404);
		});

		await expect(azureClient.getSecrets(config, ["nope"])).rejects.toThrow(
			'secret "nope" not found',
		);
	});

	it("lists secret names from paged results", async () => {
		mockFetch.mockImplementation(async (url: string) => {
			if (url.includes("login.microsoftonline.com")) {
				return jsonResponse({ access_token: "azure-token" });
			}
			if (url.includes("skiptoken")) {
				return jsonResponse({
					value: [{ id: `${config.vaultUri}/secrets/second` }],
					nextLink: null,
				});
			}
			return jsonResponse({
				value: [{ id: `${config.vaultUri}/secrets/first` }],
				nextLink: `${config.vaultUri}/secrets?api-version=7.4&skiptoken=abc`,
			});
		});

		const names = await azureClient.listSecretNames?.(config);

		expect(names).toEqual(["first", "second"]);
	});
});

describe("doppler client", () => {
	it("propagates auth errors with the status code", async () => {
		mockFetch.mockResolvedValue(jsonResponse({}, false, 401));
		await expect(
			dopplerClient.getSecrets(
				{ providerType: "doppler", serviceToken: "bad" },
				["FOO"],
			),
		).rejects.toThrow("status 401");
	});
});

describe("scaleway client", () => {
	const config = {
		providerType: "scaleway" as const,
		region: "fr-par",
		projectId: "project-1",
		secretKey: "scw-secret-key",
		apiUrl: "https://api.scaleway.com",
	};

	const accessResponse = (value: string) =>
		jsonResponse({
			secret_id: "secret-1",
			revision: 1,
			data: Buffer.from(value).toString("base64"),
		});

	it("reads a secret by name from the root path and decodes the payload", async () => {
		mockFetch.mockResolvedValue(accessResponse("postgres://real"));

		const result = await scalewayClient.getSecrets(config, ["db-url"]);

		expect(result).toEqual({ "db-url": "postgres://real" });
		expect(mockFetch).toHaveBeenCalledTimes(1);
		const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
		expect(url).toBe(
			"https://api.scaleway.com/secret-manager/v1beta1/regions/fr-par/secrets-by-path/versions/latest_enabled/access?project_id=project-1&secret_name=db-url&secret_path=%2F",
		);
		expect((init.headers as Record<string, string>)["X-Auth-Token"]).toBe(
			"scw-secret-key",
		);
	});

	it("sends the folder of a path-qualified ref as secret_path", async () => {
		mockFetch.mockResolvedValue(accessResponse("value"));

		await scalewayClient.getSecrets(config, ["prod/db/password"]);

		expect(mockFetch.mock.calls[0]?.[0]).toContain(
			"secret_name=password&secret_path=%2Fprod%2Fdb",
		);
	});

	it("extracts a field from a JSON secret and fetches the secret once", async () => {
		mockFetch.mockResolvedValue(
			accessResponse(JSON.stringify({ user: "admin", port: 5432 })),
		);

		const result = await scalewayClient.getSecrets(config, [
			"db-creds:user",
			"db-creds:port",
		]);

		expect(result).toEqual({
			"db-creds:user": "admin",
			"db-creds:port": "5432",
		});
		expect(mockFetch).toHaveBeenCalledTimes(1);
	});

	it("throws when the secret is not JSON but a field is requested", async () => {
		mockFetch.mockResolvedValue(accessResponse("plain-value"));

		await expect(
			scalewayClient.getSecrets(config, ["db-creds:user"]),
		).rejects.toThrow("is not JSON");
	});

	it("throws when the requested field is missing", async () => {
		mockFetch.mockResolvedValue(accessResponse(JSON.stringify({ user: "a" })));

		await expect(
			scalewayClient.getSecrets(config, ["db-creds:password"]),
		).rejects.toThrow('field "password" not found');
	});

	it("throws a clear error for a missing secret", async () => {
		mockFetch.mockResolvedValue(
			jsonResponse({ message: "not found" }, false, 404),
		);

		await expect(scalewayClient.getSecrets(config, ["nope"])).rejects.toThrow(
			'secret "nope" not found in path "/"',
		);
	});

	it("reports authentication failures with the API message", async () => {
		mockFetch.mockResolvedValue(
			jsonResponse({ message: "denied authentication" }, false, 403),
		);

		await expect(scalewayClient.getSecrets(config, ["db-url"])).rejects.toThrow(
			"authentication failed (status 403: denied authentication)",
		);
	});

	it("throws when the secret has no enabled version", async () => {
		mockFetch.mockResolvedValue(jsonResponse({ secret_id: "secret-1" }));

		await expect(scalewayClient.getSecrets(config, ["db-url"])).rejects.toThrow(
			"has no enabled version",
		);
	});

	it("rejects a ref without a secret name", async () => {
		await expect(scalewayClient.getSecrets(config, ["prod/"])).rejects.toThrow(
			"expected format <name> or <folder>/<name>[:field]",
		);
	});

	it("tests the connection against the secrets listing", async () => {
		mockFetch.mockResolvedValue(jsonResponse({ secrets: [], total_count: 0 }));

		await scalewayClient.testConnection(config);

		expect(mockFetch.mock.calls[0]?.[0]).toBe(
			"https://api.scaleway.com/secret-manager/v1beta1/regions/fr-par/secrets?project_id=project-1&page_size=1",
		);
	});

	it("lists secret names with their folder prefix", async () => {
		mockFetch.mockResolvedValue(
			jsonResponse({
				secrets: [
					{ id: "1", name: "db-url", path: "/" },
					{ id: "2", name: "password", path: "/prod/db" },
				],
				total_count: 2,
			}),
		);

		const names = await scalewayClient.listSecretNames?.(config);

		expect(names).toEqual(["db-url", "prod/db/password"]);
		expect(mockFetch).toHaveBeenCalledTimes(1);
	});

	it("follows pagination until a short page is returned", async () => {
		const page = (start: number, size: number) =>
			jsonResponse({
				secrets: Array.from({ length: size }, (_, index) => ({
					id: String(start + index),
					name: `secret-${start + index}`,
					path: "/",
				})),
			});
		mockFetch.mockImplementation(async (url: string) =>
			url.includes("page=2") ? page(101, 2) : page(1, 100),
		);

		const names = await scalewayClient.listSecretNames?.(config);

		expect(names).toHaveLength(102);
		expect(mockFetch).toHaveBeenCalledTimes(2);
	});

	it("resolves env refs end to end through a scaleway provider", async () => {
		findMany.mockResolvedValue([
			{
				name: "scw-prod",
				providerType: "scaleway",
				config,
				assignments: assignedEverywhere,
			},
		]);
		mockFetch.mockResolvedValue(accessResponse("s3cret"));

		const result = await resolveVaultReferences(
			"DB_PASSWORD=${{vault.scw-prod.prod/db-password}}",
			scope,
		);

		expect(result).toBe("DB_PASSWORD=s3cret");
	});
});

describe("phase client", () => {
	const config = {
		providerType: "phase" as const,
		token: "phase-rest-token",
		appId: "app-123",
		env: "Production",
		path: "/",
		apiUrl: "https://api.phase.dev",
	};

	it("fetches secrets by key and sends ServiceAccount auth", async () => {
		mockFetch.mockResolvedValue(
			jsonResponse([
				{ key: "DB_URL", value: "postgres://real", path: "/" },
				{ key: "API_KEY", value: "key-123", path: "/" },
			]),
		);

		const result = await phaseClient.getSecrets(config, ["DB_URL", "API_KEY"]);

		expect(result).toEqual({ DB_URL: "postgres://real", API_KEY: "key-123" });
		expect(mockFetch).toHaveBeenCalledTimes(1);
		const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
		expect(url).toBe(
			"https://api.phase.dev/v1/secrets/?app_id=app-123&env=Production&path=%2F",
		);
		expect((init.headers as Record<string, string>).Authorization).toBe(
			"Bearer ServiceAccount phase-rest-token",
		);
	});

	it("throws when a requested secret is missing", async () => {
		mockFetch.mockResolvedValue(
			jsonResponse([{ key: "DB_URL", value: "postgres://real", path: "/" }]),
		);

		await expect(phaseClient.getSecrets(config, ["MISSING"])).rejects.toThrow(
			'secret "MISSING" not found in environment "Production"',
		);
	});

	it("reports authentication failures with the status code", async () => {
		mockFetch.mockResolvedValue(
			jsonResponse({ error: "unauthorized" }, false, 401),
		);

		await expect(phaseClient.getSecrets(config, ["DB_URL"])).rejects.toThrow(
			"authentication failed (status 401: unauthorized)",
		);
	});

	it("rejects apps without SSE enabled during testConnection", async () => {
		mockFetch.mockResolvedValueOnce(
			jsonResponse({
				id: "app-123",
				name: "My App",
				sseEnabled: false,
			}),
		);

		await expect(phaseClient.testConnection(config)).rejects.toThrow(
			"enable Server-side Encryption (SSE)",
		);
		expect(mockFetch).toHaveBeenCalledTimes(1);
		expect(mockFetch.mock.calls[0]?.[0]).toBe(
			"https://api.phase.dev/v1/apps/app-123/",
		);
	});

	it("tests connection against the app then secrets listing", async () => {
		mockFetch
			.mockResolvedValueOnce(
				jsonResponse({
					id: "app-123",
					name: "My App",
					sseEnabled: true,
				}),
			)
			.mockResolvedValueOnce(jsonResponse([]));

		await phaseClient.testConnection(config);

		expect(mockFetch).toHaveBeenCalledTimes(2);
		expect(mockFetch.mock.calls[0]?.[0]).toBe(
			"https://api.phase.dev/v1/apps/app-123/",
		);
		expect(mockFetch.mock.calls[1]?.[0]).toBe(
			"https://api.phase.dev/v1/secrets/?app_id=app-123&env=Production&path=%2F",
		);
	});

	it("lists secret names from the configured path", async () => {
		mockFetch.mockResolvedValue(
			jsonResponse([
				{ key: "DB_URL", value: "x", path: "/" },
				{ key: "API_KEY", value: "y", path: "/" },
			]),
		);

		const names = await phaseClient.listSecretNames?.(config);

		expect(names).toEqual(["DB_URL", "API_KEY"]);
	});

	it("resolves env refs end to end through a phase provider", async () => {
		findMany.mockResolvedValue([
			{
				name: "phase-prod",
				providerType: "phase",
				config,
				assignments: assignedEverywhere,
			},
		]);
		mockFetch.mockResolvedValue(
			jsonResponse([{ key: "DB_PASSWORD", value: "s3cret", path: "/" }]),
		);

		const result = await resolveVaultReferences(
			"DB_PASSWORD=${{vault.phase-prod.DB_PASSWORD}}",
			scope,
		);

		expect(result).toBe("DB_PASSWORD=s3cret");
	});
});

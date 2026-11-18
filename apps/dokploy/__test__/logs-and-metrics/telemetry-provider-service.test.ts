import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	insertValues: vi.fn(),
	updateSet: vi.fn(),
	findFirst: vi.fn(),
	findMany: vi.fn(),
	serverFindFirst: vi.fn(),
	serverFindMany: vi.fn(),
	webServerFindFirst: vi.fn(),
}));

vi.mock("@dokploy/server/db", () => ({
	db: {
		insert: () => ({
			values: (v: any) => ({
				returning: () => Promise.resolve(mocks.insertValues(v)),
			}),
		}),
		update: () => ({
			set: (v: any) => ({
				where: () => ({
					returning: () => Promise.resolve(mocks.updateSet(v)),
				}),
			}),
		}),
		query: {
			telemetryProvider: {
				findFirst: mocks.findFirst,
				findMany: mocks.findMany,
			},
			server: {
				findFirst: mocks.serverFindFirst,
				findMany: mocks.serverFindMany,
			},
			webServerSettings: { findFirst: mocks.webServerFindFirst },
		},
	},
}));

const {
	assertProvidersBelongToOrg,
	assertSignalsSupported,
	createTelemetryProvider,
	testTelemetryProviderConnection,
	updateTelemetryProvider,
} = await import("@dokploy/server/services/logs-and-metrics/service");
const { telemetryProviderAdapters } = await import(
	"@dokploy/server/services/logs-and-metrics/providers/registry"
);

beforeEach(() => {
	mocks.serverFindMany.mockResolvedValue([]);
	mocks.webServerFindFirst.mockResolvedValue(undefined);
});

describe("updateTelemetryProvider — targets to re-apply", () => {
	const existing = {
		telemetryProviderId: "lp-1",
		name: "loki",
		providerType: "loki",
		signals: ["logs"],
		endpoint: "https://loki.example.com",
		apiKey: "old",
		apiSecret: null,
		extraConfig: null,
		enabled: true,
	};

	beforeEach(() => {
		mocks.findFirst.mockResolvedValue(existing);
		mocks.updateSet.mockReturnValue([{ ...existing, apiKey: "new" }]);
		mocks.serverFindMany.mockResolvedValue([{ serverId: "server-1" }]);
		mocks.webServerFindFirst.mockResolvedValue({ id: "ws-1" });
	});

	it("returns the servers and the local host that ship with it when a credential changes", async () => {
		const { targets } = await updateTelemetryProvider("lp-1", {
			apiKey: "new",
		});
		expect(targets).toEqual(["server-1", null]);
	});

	it("returns the same targets when the provider is disabled", async () => {
		const { targets } = await updateTelemetryProvider("lp-1", {
			enabled: false,
		});
		expect(targets).toEqual(["server-1", null]);
	});

	it("returns no targets when only the name changes or a value is re-sent unchanged", async () => {
		expect(
			(await updateTelemetryProvider("lp-1", { name: "renamed" })).targets,
		).toEqual([]);
		expect(
			(
				await updateTelemetryProvider("lp-1", {
					endpoint: "https://loki.example.com",
				})
			).targets,
		).toEqual([]);
	});
});

describe("createTelemetryProvider — required credential fields per adapter", () => {
	it("rejects a loki provider without endpoint", async () => {
		await expect(
			createTelemetryProvider(
				{ name: "loki-prod", providerType: "loki", signals: ["logs"] } as any,
				"org-1",
			),
		).rejects.toThrow(/endpoint/i);
		expect(mocks.insertValues).not.toHaveBeenCalled();
	});

	it("rejects a datadog provider without apiKey", async () => {
		await expect(
			createTelemetryProvider(
				{ name: "dd", providerType: "datadog", signals: ["logs"] } as any,
				"org-1",
			),
		).rejects.toThrow();
		expect(mocks.insertValues).not.toHaveBeenCalled();
	});

	it("rejects a betterstack provider missing either field", async () => {
		await expect(
			createTelemetryProvider(
				{
					name: "bs",
					providerType: "betterstack",
					signals: ["logs"],
					apiKey: "token-only",
				} as any,
				"org-1",
			),
		).rejects.toThrow();
		expect(mocks.insertValues).not.toHaveBeenCalled();
	});

	it("rejects a splunk_hec provider without a HEC token", async () => {
		await expect(
			createTelemetryProvider(
				{
					name: "splunk",
					providerType: "splunk_hec",
					signals: ["logs"],
					endpoint: "https://splunk.example.com:8088",
				} as any,
				"org-1",
			),
		).rejects.toThrow(/token/i);
		expect(mocks.insertValues).not.toHaveBeenCalled();
	});

	it("rejects an aws_cloudwatch provider missing required extraConfig fields (region/log group)", async () => {
		await expect(
			createTelemetryProvider(
				{
					name: "cw",
					providerType: "aws_cloudwatch",
					signals: ["logs"],
					apiKey: "AKIA...",
					apiSecret: "shh",
				} as any,
				"org-1",
			),
		).rejects.toThrow(/region|log group/i);
		expect(mocks.insertValues).not.toHaveBeenCalled();
	});

	it("rejects a datadog provider whose apiKey only exists inside extraConfig, not the real column", async () => {
		await expect(
			createTelemetryProvider(
				{
					name: "dd",
					providerType: "datadog",
					signals: ["logs"],
					extraConfig: { apiKey: "sneaky-value" },
				} as any,
				"org-1",
			),
		).rejects.toThrow(/api key/i);
		expect(mocks.insertValues).not.toHaveBeenCalled();
	});

	it("rejects an elasticsearch provider with a username but no password (adapter.validateConfig)", async () => {
		await expect(
			createTelemetryProvider(
				{
					name: "es",
					providerType: "elasticsearch",
					signals: ["logs"],
					endpoint: "https://es.example.com:9200",
					extraConfig: { username: "elastic" },
				} as any,
				"org-1",
			),
		).rejects.toThrow(/password.*required/i);
		expect(mocks.insertValues).not.toHaveBeenCalled();
	});

	it("accepts an aws_cloudwatch provider with region and log group set via extraConfig", async () => {
		mocks.insertValues.mockReturnValue([
			{
				telemetryProviderId: "lp-2",
				name: "cw",
				providerType: "aws_cloudwatch",
				signals: ["logs"],
			},
		]);
		const created = await createTelemetryProvider(
			{
				name: "cw",
				providerType: "aws_cloudwatch",
				signals: ["logs"],
				apiKey: "AKIA...",
				apiSecret: "shh",
				extraConfig: { region: "us-east-1", logGroup: "/dokploy/logs" },
			} as any,
			"org-1",
		);
		expect(created.telemetryProviderId).toBe("lp-2");
	});

	it("accepts a loki provider with endpoint", async () => {
		mocks.insertValues.mockReturnValue([
			{ telemetryProviderId: "lp-1", name: "loki-prod", providerType: "loki" },
		]);
		const created = await createTelemetryProvider(
			{
				name: "loki-prod",
				providerType: "loki",
				signals: ["logs"],
				endpoint: "https://loki.example.com",
			} as any,
			"org-1",
		);
		expect(created.telemetryProviderId).toBe("lp-1");
		expect(mocks.insertValues).toHaveBeenCalled();
	});
});

describe("updateTelemetryProvider — merges partial update with existing row before validating", () => {
	it("allows updating just the name without re-sending existing credentials", async () => {
		mocks.findFirst.mockResolvedValue({
			telemetryProviderId: "lp-1",
			name: "old-name",
			providerType: "loki",
			signals: ["logs"],
			endpoint: "https://loki.example.com",
			apiKey: null,
			apiSecret: null,
			extraConfig: null,
		});
		mocks.updateSet.mockReturnValue([
			{ telemetryProviderId: "lp-1", name: "new-name" },
		]);

		const { provider: updated, targets } = await updateTelemetryProvider(
			"lp-1",
			{ name: "new-name" },
		);
		expect(updated.name).toBe("new-name");
		expect(targets).toEqual([]);
	});

	it("rejects clearing the only required field via update", async () => {
		mocks.findFirst.mockResolvedValue({
			telemetryProviderId: "lp-1",
			name: "loki-prod",
			providerType: "loki",
			signals: ["logs"],
			endpoint: "https://loki.example.com",
			apiKey: null,
			apiSecret: null,
			extraConfig: null,
		});

		await expect(
			updateTelemetryProvider("lp-1", { endpoint: null }),
		).rejects.toThrow(/endpoint/i);
	});

	it("clears the old provider's credentials when providerType changes, unless new values are given", async () => {
		mocks.findFirst.mockResolvedValue({
			telemetryProviderId: "lp-1",
			name: "dd-prod",
			providerType: "datadog",
			signals: ["logs"],
			endpoint: null,
			apiKey: "old-datadog-key",
			apiSecret: null,
			extraConfig: { site: "datadoghq.com" },
		});
		mocks.updateSet.mockReturnValue([{ telemetryProviderId: "lp-1" }]);

		await updateTelemetryProvider("lp-1", {
			providerType: "loki",
			signals: ["logs"],
			endpoint: "https://loki.example.com",
		});

		expect(mocks.updateSet).toHaveBeenCalledWith(
			expect.objectContaining({
				providerType: "loki",
				signals: ["logs"],
				endpoint: "https://loki.example.com",
				apiKey: null,
				apiSecret: null,
				extraConfig: null,
			}),
		);
	});

	it("merges a partial extraConfig update instead of replacing it wholesale", async () => {
		mocks.findFirst.mockResolvedValue({
			telemetryProviderId: "lp-1",
			name: "es-prod",
			providerType: "elasticsearch",
			signals: ["logs"],
			endpoint: "https://es.example.com:9200",
			apiKey: "secret",
			apiSecret: null,
			extraConfig: { username: "elastic", index: "custom-index" },
		});
		mocks.updateSet.mockReturnValue([{ telemetryProviderId: "lp-1" }]);

		await updateTelemetryProvider("lp-1", {
			extraConfig: { username: "new-user" },
		});

		expect(mocks.updateSet).toHaveBeenCalledWith(
			expect.objectContaining({
				extraConfig: { username: "new-user", index: "custom-index" },
			}),
		);
	});

	it("clears extraConfig entirely when explicitly set to null, instead of merging", async () => {
		mocks.findFirst.mockResolvedValue({
			telemetryProviderId: "lp-1",
			name: "es-prod",
			providerType: "elasticsearch",
			signals: ["logs"],
			endpoint: "https://es.example.com:9200",
			apiKey: null,
			apiSecret: null,
			extraConfig: { username: "elastic" },
		});
		mocks.updateSet.mockReturnValue([{ telemetryProviderId: "lp-1" }]);

		await updateTelemetryProvider("lp-1", { extraConfig: null });

		expect(mocks.updateSet).toHaveBeenCalledWith(
			expect.objectContaining({ extraConfig: null }),
		);
	});

	it("clears an optional credential when it is explicitly set to null", async () => {
		mocks.findFirst.mockResolvedValue({
			telemetryProviderId: "lp-1",
			name: "loki-prod",
			providerType: "loki",
			signals: ["logs"],
			endpoint: "https://loki.example.com",
			apiKey: "old-token",
			apiSecret: null,
			extraConfig: { username: "user" },
		});
		mocks.updateSet.mockReturnValue([{ telemetryProviderId: "lp-1" }]);

		await updateTelemetryProvider("lp-1", { apiKey: null });

		expect(mocks.updateSet).toHaveBeenCalledWith(
			expect.objectContaining({ apiKey: null }),
		);
	});

	it("rejects clearing the elasticsearch password while a username stays saved", async () => {
		mocks.findFirst.mockResolvedValue({
			telemetryProviderId: "lp-1",
			name: "es-prod",
			providerType: "elasticsearch",
			signals: ["logs"],
			endpoint: "https://es.example.com:9200",
			apiKey: "old-password",
			apiSecret: null,
			extraConfig: { username: "elastic" },
		});

		await expect(
			updateTelemetryProvider("lp-1", { apiKey: null }),
		).rejects.toThrow(/Password/);
	});

	it("rejects a providerType change that doesn't satisfy the new type's required fields", async () => {
		mocks.findFirst.mockResolvedValue({
			telemetryProviderId: "lp-1",
			name: "dd-prod",
			providerType: "datadog",
			signals: ["logs"],
			endpoint: null,
			apiKey: "old-datadog-key",
			apiSecret: null,
			extraConfig: null,
		});

		await expect(
			updateTelemetryProvider("lp-1", { providerType: "loki" }),
		).rejects.toThrow(/endpoint/i);
	});
});

describe("assertSignalsSupported", () => {
	it("rejects a repeated signal", () => {
		expect(() => assertSignalsSupported("loki", ["logs", "logs"])).toThrow(
			/only be selected once/,
		);
	});

	it("rejects a signal the type cannot send", () => {
		expect(() => assertSignalsSupported("loki", ["metrics"])).toThrow(
			/Grafana Loki cannot send metrics/,
		);
	});

	it("accepts a supported subset", () => {
		expect(() => assertSignalsSupported("loki", ["logs"])).not.toThrow();
	});
});

describe("createTelemetryProvider — signals", () => {
	it("rejects a provider whose type cannot send the selected signal", async () => {
		mocks.insertValues.mockClear();
		await expect(
			createTelemetryProvider(
				{
					name: "loki",
					providerType: "loki",
					signals: ["metrics"],
					endpoint: "https://loki.example.com",
				} as any,
				"org-1",
			),
		).rejects.toThrow(/cannot send metrics/);
		expect(mocks.insertValues).not.toHaveBeenCalled();
	});
});

describe("assertProvidersBelongToOrg", () => {
	beforeEach(() => {
		mocks.findMany.mockResolvedValue([
			{
				telemetryProviderId: "lp-1",
				name: "loki",
				enabled: true,
				signals: ["logs"],
			},
		]);
	});

	it("accepts a provider of the organization regardless of what it sends", async () => {
		await expect(
			assertProvidersBelongToOrg(["lp-1"], "org-1"),
		).resolves.toBeUndefined();
	});

	it("rejects an id that is not in the organization", async () => {
		await expect(
			assertProvidersBelongToOrg(["lp-9"], "org-1"),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
	});

	it("rejects a selection where every provider is disabled", async () => {
		mocks.findMany.mockResolvedValue([
			{
				telemetryProviderId: "lp-1",
				name: "loki",
				enabled: false,
				signals: ["logs"],
			},
		]);
		await expect(assertProvidersBelongToOrg(["lp-1"], "org-1")).rejects.toThrow(
			/at least one enabled provider/,
		);
	});
});

describe("required fields scoped to a signal", () => {
	beforeEach(() => {
		mocks.insertValues.mockReset();
		mocks.insertValues.mockReturnValue([{ telemetryProviderId: "cw-1" }]);
	});

	it("does not require the log group when only metrics are selected", async () => {
		await expect(
			createTelemetryProvider(
				{
					name: "cw",
					providerType: "aws_cloudwatch",
					signals: ["metrics"],
					apiKey: "AKIA",
					apiSecret: "shh",
					extraConfig: { region: "us-east-1", metricsNamespace: "Dokploy" },
				} as any,
				"org-1",
			),
		).resolves.toMatchObject({ telemetryProviderId: "cw-1" });
	});

	it("does not require the metrics namespace when only logs are selected", async () => {
		await expect(
			createTelemetryProvider(
				{
					name: "cw",
					providerType: "aws_cloudwatch",
					signals: ["logs"],
					apiKey: "AKIA",
					apiSecret: "shh",
					extraConfig: { region: "us-east-1", logGroup: "/dokploy/logs" },
				} as any,
				"org-1",
			),
		).resolves.toMatchObject({ telemetryProviderId: "cw-1" });
	});

	it("requires the metrics namespace when metrics are selected", async () => {
		await expect(
			createTelemetryProvider(
				{
					name: "cw",
					providerType: "aws_cloudwatch",
					signals: ["logs", "metrics"],
					apiKey: "AKIA",
					apiSecret: "shh",
					extraConfig: { region: "us-east-1", logGroup: "/dokploy/logs" },
				} as any,
				"org-1",
			),
		).rejects.toThrow(/Metrics namespace/);
		expect(mocks.insertValues).not.toHaveBeenCalled();
	});
});

describe("signals are stored in a fixed order", () => {
	it("normalizes the order on create", async () => {
		mocks.insertValues.mockReset();
		mocks.insertValues.mockReturnValue([{ telemetryProviderId: "dd-1" }]);

		await createTelemetryProvider(
			{
				name: "dd",
				providerType: "datadog",
				signals: ["metrics", "logs"],
				apiKey: "dd-key",
			} as any,
			"org-1",
		);

		expect(mocks.insertValues).toHaveBeenCalledWith(
			expect.objectContaining({ signals: ["logs", "metrics"] }),
		);
	});

	it("normalizes the order on update", async () => {
		mocks.findFirst.mockResolvedValue({
			telemetryProviderId: "dd-1",
			name: "dd",
			providerType: "datadog",
			signals: ["logs"],
			endpoint: null,
			apiKey: "dd-key",
			apiSecret: null,
			extraConfig: null,
		});
		mocks.updateSet.mockReturnValue([{ telemetryProviderId: "dd-1" }]);

		await updateTelemetryProvider("dd-1", { signals: ["metrics", "logs"] });

		expect(mocks.updateSet).toHaveBeenCalledWith(
			expect.objectContaining({ signals: ["logs", "metrics"] }),
		);
	});
});

describe("testTelemetryProviderConnection by id", () => {
	it("tests the saved provider with the signals override from the form", async () => {
		mocks.findFirst.mockResolvedValue({
			telemetryProviderId: "bs-1",
			name: "bs",
			providerType: "betterstack",
			signals: ["logs"],
			endpoint: "in.logs.betterstack.com",
			apiKey: "token",
			apiSecret: null,
			extraConfig: null,
		});
		const spy = vi
			.spyOn(telemetryProviderAdapters.betterstack, "testConnection")
			.mockResolvedValue(undefined);

		await testTelemetryProviderConnection({
			telemetryProviderId: "bs-1",
			signals: ["logs", "metrics"],
		});

		expect(spy).toHaveBeenCalledWith(
			expect.objectContaining({
				apiKey: "token",
				signals: ["logs", "metrics"],
			}),
		);
		spy.mockRestore();
	});
});

describe("updateTelemetryProvider — signals", () => {
	const existing = {
		telemetryProviderId: "dd-1",
		name: "datadog",
		providerType: "datadog",
		signals: ["logs", "metrics"],
		endpoint: null,
		apiKey: "dd-key",
		apiSecret: null,
		extraConfig: null,
	};

	beforeEach(() => {
		mocks.updateSet.mockReset();
		mocks.serverFindFirst.mockReset();
		mocks.webServerFindFirst.mockReset();
		mocks.findFirst.mockResolvedValue(existing);
		mocks.updateSet.mockReturnValue([{ ...existing, signals: ["metrics"] }]);
	});

	it("allows removing a signal while the provider is assigned and returns its targets to re-apply", async () => {
		mocks.serverFindMany.mockResolvedValue([{ serverId: "server-1" }]);
		mocks.webServerFindFirst.mockResolvedValue({ id: "ws-1" });

		await expect(
			updateTelemetryProvider("dd-1", { signals: ["metrics"] }),
		).resolves.toMatchObject({
			provider: { signals: ["metrics"] },
			targets: ["server-1", null],
		});
		expect(mocks.updateSet).toHaveBeenCalledWith(
			expect.objectContaining({ signals: ["metrics"] }),
		);
	});

	it("rejects a type change that cannot send the saved signals", async () => {
		await expect(
			updateTelemetryProvider("dd-1", {
				providerType: "loki",
				endpoint: "https://loki.example.com",
			}),
		).rejects.toThrow(/Grafana Loki cannot send metrics/);
	});
});

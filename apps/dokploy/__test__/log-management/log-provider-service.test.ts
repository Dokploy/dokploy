import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	insertValues: vi.fn(),
	updateSet: vi.fn(),
	findFirst: vi.fn(),
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
			logProvider: {
				findFirst: mocks.findFirst,
			},
		},
	},
}));

const { createLogProvider, updateLogProvider } = await import(
	"@dokploy/server/services/log-management/service"
);

describe("createLogProvider — required credential fields per adapter", () => {
	it("rejects a loki provider without endpoint", async () => {
		await expect(
			createLogProvider(
				{ name: "loki-prod", providerType: "loki" } as any,
				"org-1",
			),
		).rejects.toThrow(/endpoint/i);
		expect(mocks.insertValues).not.toHaveBeenCalled();
	});

	it("rejects a datadog provider without apiKey", async () => {
		await expect(
			createLogProvider(
				{ name: "dd", providerType: "datadog" } as any,
				"org-1",
			),
		).rejects.toThrow();
		expect(mocks.insertValues).not.toHaveBeenCalled();
	});

	it("rejects a betterstack provider missing either field", async () => {
		await expect(
			createLogProvider(
				{
					name: "bs",
					providerType: "betterstack",
					apiKey: "token-only",
				} as any,
				"org-1",
			),
		).rejects.toThrow();
		expect(mocks.insertValues).not.toHaveBeenCalled();
	});

	it("rejects a splunk_hec provider without a HEC token", async () => {
		await expect(
			createLogProvider(
				{
					name: "splunk",
					providerType: "splunk_hec",
					endpoint: "https://splunk.example.com:8088",
				} as any,
				"org-1",
			),
		).rejects.toThrow(/token/i);
		expect(mocks.insertValues).not.toHaveBeenCalled();
	});

	it("rejects an aws_cloudwatch provider missing required extraConfig fields (region/log group)", async () => {
		await expect(
			createLogProvider(
				{
					name: "cw",
					providerType: "aws_cloudwatch",
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
			createLogProvider(
				{
					name: "dd",
					providerType: "datadog",
					extraConfig: { apiKey: "sneaky-value" },
				} as any,
				"org-1",
			),
		).rejects.toThrow(/api key/i);
		expect(mocks.insertValues).not.toHaveBeenCalled();
	});

	it("rejects an elasticsearch provider with a username but no password (adapter.validateConfig)", async () => {
		await expect(
			createLogProvider(
				{
					name: "es",
					providerType: "elasticsearch",
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
			{ logProviderId: "lp-2", name: "cw", providerType: "aws_cloudwatch" },
		]);
		const created = await createLogProvider(
			{
				name: "cw",
				providerType: "aws_cloudwatch",
				apiKey: "AKIA...",
				apiSecret: "shh",
				extraConfig: { region: "us-east-1", logGroup: "/dokploy/logs" },
			} as any,
			"org-1",
		);
		expect(created.logProviderId).toBe("lp-2");
	});

	it("accepts a loki provider with endpoint", async () => {
		mocks.insertValues.mockReturnValue([
			{ logProviderId: "lp-1", name: "loki-prod", providerType: "loki" },
		]);
		const created = await createLogProvider(
			{
				name: "loki-prod",
				providerType: "loki",
				endpoint: "https://loki.example.com",
			} as any,
			"org-1",
		);
		expect(created.logProviderId).toBe("lp-1");
		expect(mocks.insertValues).toHaveBeenCalled();
	});
});

describe("updateLogProvider — merges partial update with existing row before validating", () => {
	it("allows updating just the name without re-sending existing credentials", async () => {
		mocks.findFirst.mockResolvedValue({
			logProviderId: "lp-1",
			name: "old-name",
			providerType: "loki",
			endpoint: "https://loki.example.com",
			apiKey: null,
			apiSecret: null,
			extraConfig: null,
		});
		mocks.updateSet.mockReturnValue([
			{ logProviderId: "lp-1", name: "new-name" },
		]);

		const updated = await updateLogProvider("lp-1", { name: "new-name" });
		expect(updated.name).toBe("new-name");
	});

	it("rejects clearing the only required field via update", async () => {
		mocks.findFirst.mockResolvedValue({
			logProviderId: "lp-1",
			name: "loki-prod",
			providerType: "loki",
			endpoint: "https://loki.example.com",
			apiKey: null,
			apiSecret: null,
			extraConfig: null,
		});

		await expect(updateLogProvider("lp-1", { endpoint: null })).rejects.toThrow(
			/endpoint/i,
		);
	});

	it("clears the old provider's credentials when providerType changes, unless new values are given", async () => {
		mocks.findFirst.mockResolvedValue({
			logProviderId: "lp-1",
			name: "dd-prod",
			providerType: "datadog",
			endpoint: null,
			apiKey: "old-datadog-key",
			apiSecret: null,
			extraConfig: { site: "datadoghq.com" },
		});
		mocks.updateSet.mockReturnValue([{ logProviderId: "lp-1" }]);

		await updateLogProvider("lp-1", {
			providerType: "loki",
			endpoint: "https://loki.example.com",
		});

		expect(mocks.updateSet).toHaveBeenCalledWith(
			expect.objectContaining({
				providerType: "loki",
				endpoint: "https://loki.example.com",
				apiKey: null,
				apiSecret: null,
				extraConfig: null,
			}),
		);
	});

	it("merges a partial extraConfig update instead of replacing it wholesale", async () => {
		mocks.findFirst.mockResolvedValue({
			logProviderId: "lp-1",
			name: "es-prod",
			providerType: "elasticsearch",
			endpoint: "https://es.example.com:9200",
			apiKey: "secret",
			apiSecret: null,
			extraConfig: { username: "elastic", index: "custom-index" },
		});
		mocks.updateSet.mockReturnValue([{ logProviderId: "lp-1" }]);

		await updateLogProvider("lp-1", { extraConfig: { username: "new-user" } });

		expect(mocks.updateSet).toHaveBeenCalledWith(
			expect.objectContaining({
				extraConfig: { username: "new-user", index: "custom-index" },
			}),
		);
	});

	it("clears extraConfig entirely when explicitly set to null, instead of merging", async () => {
		mocks.findFirst.mockResolvedValue({
			logProviderId: "lp-1",
			name: "es-prod",
			providerType: "elasticsearch",
			endpoint: "https://es.example.com:9200",
			apiKey: null,
			apiSecret: null,
			extraConfig: { username: "elastic" },
		});
		mocks.updateSet.mockReturnValue([{ logProviderId: "lp-1" }]);

		await updateLogProvider("lp-1", { extraConfig: null });

		expect(mocks.updateSet).toHaveBeenCalledWith(
			expect.objectContaining({ extraConfig: null }),
		);
	});

	it("rejects a providerType change that doesn't satisfy the new type's required fields", async () => {
		mocks.findFirst.mockResolvedValue({
			logProviderId: "lp-1",
			name: "dd-prod",
			providerType: "datadog",
			endpoint: null,
			apiKey: "old-datadog-key",
			apiSecret: null,
			extraConfig: null,
		});

		await expect(
			updateLogProvider("lp-1", { providerType: "loki" }),
		).rejects.toThrow(/endpoint/i);
	});
});

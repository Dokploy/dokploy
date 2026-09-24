import { describe, expect, it, vi } from "vitest";

vi.mock("@dokploy/server/db", () => ({
	db: {
		query: { projects: { findMany: vi.fn() } },
	},
}));

const { collectSecretValues, redactSecrets } = await import(
	"@dokploy/server/setup/vector-setup"
);

describe("collectSecretValues / redactSecrets", () => {
	it("collects endpoint/apiKey/apiSecret and string extraConfig values across all providers", () => {
		const providers = [
			{
				endpoint: "https://loki.example.com",
				apiKey: "loki-key",
				apiSecret: null,
				extraConfig: { tenantId: "tenant-a" },
			},
			{
				endpoint: null,
				apiKey: "dd-key",
				apiSecret: null,
				extraConfig: { site: "datadoghq.eu" },
			},
		] as any;

		expect(collectSecretValues(providers)).toEqual(
			expect.arrayContaining([
				"https://loki.example.com",
				"loki-key",
				"tenant-a",
				"dd-key",
				"datadoghq.eu",
			]),
		);
	});

	it("ignores non-string extraConfig values and null/empty credentials", () => {
		const providers = [
			{
				endpoint: null,
				apiKey: null,
				apiSecret: null,
				extraConfig: { limit: 10, enabled: true, empty: "" },
			},
		] as any;
		expect(collectSecretValues(providers)).toEqual([]);
	});

	it("redacts every collected secret, longest first so a short one can't eat part of a longer one", () => {
		const providers = [
			{
				endpoint: null,
				apiKey: "hunter2-long-suffix",
				apiSecret: null,
				extraConfig: { other: "hunter2" },
			},
		] as any;
		const text =
			"sink validation error near apiKey=hunter2-long-suffix and hunter2";

		const redacted = redactSecrets(text, collectSecretValues(providers));

		expect(redacted).not.toContain("hunter2");
		expect(redacted).toBe(
			"sink validation error near apiKey=[redacted] and [redacted]",
		);
	});
});

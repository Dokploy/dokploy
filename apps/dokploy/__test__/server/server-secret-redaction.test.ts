import { REDACTED_SECRET_VALUE } from "@dokploy/server/utils/security/redaction";
import { describe, expect, it, vi } from "vitest";

vi.mock("@dokploy/server/db", () => ({
	db: {},
}));

vi.mock("@dokploy/server/services/proprietary/license-key", () => ({
	hasValidLicense: vi.fn(),
}));

const { redactServer, redactServers, resolveServerMetricsConfigUpdate } =
	await import("@dokploy/server/services/server");

const metricsConfig = {
	server: {
		type: "Remote" as const,
		refreshRate: 60,
		port: 4500,
		token: "stored-token",
		urlCallback: "https://example.com/callback",
		retentionDays: 2,
		cronJob: "0 0 * * *",
		thresholds: {
			cpu: 80,
			memory: 80,
		},
	},
	containers: {
		refreshRate: 60,
		services: {
			include: [],
			exclude: [],
		},
	},
};

describe("server secret redaction helpers", () => {
	it("redacts monitoring tokens and SSH private keys", () => {
		const redacted = redactServer({
			serverId: "server-1",
			command: "curl https://example.com/install.sh | sh",
			metricsConfig,
			sshKey: {
				sshKeyId: "ssh-1",
				privateKey: "private-key",
				publicKey: "public-key",
			},
		});

		expect(redacted.command).toBe(REDACTED_SECRET_VALUE);
		expect(redacted.metricsConfig.server.token).toBe(REDACTED_SECRET_VALUE);
		expect(redacted.sshKey?.privateKey).toBe(REDACTED_SECRET_VALUE);
		expect(redacted.sshKey?.publicKey).toBe("public-key");
	});

	it("redacts lists of server rows", () => {
		const [redacted] = redactServers([
			{
				serverId: "server-1",
				metricsConfig,
			},
		]);

		expect(redacted).toBeDefined();
		if (!redacted) {
			throw new Error("Expected redacted server row");
		}
		expect(redacted.metricsConfig.server.token).toBe(REDACTED_SECRET_VALUE);
	});

	it("preserves the existing monitoring token when the update payload is redacted", () => {
		const resolved = resolveServerMetricsConfigUpdate(
			{
				...metricsConfig,
				server: {
					...metricsConfig.server,
					token: REDACTED_SECRET_VALUE,
				},
			},
			metricsConfig,
		);

		expect(resolved.server.token).toBe("stored-token");
	});
});

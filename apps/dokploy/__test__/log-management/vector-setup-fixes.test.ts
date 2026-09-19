import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	reserve: vi.fn(),
}));

vi.mock("@dokploy/server/db", () => ({
	db: {
		query: { projects: { findMany: vi.fn() } },
	},
}));

vi.mock("postgres", () => ({
	default: vi.fn(() => ({ reserve: mocks.reserve })),
}));

const makeReservedMock = (locked: boolean) => {
	const tag: any = vi
		.fn()
		.mockImplementation((strings: TemplateStringsArray) => {
			const text = strings.join("");
			if (text.includes("pg_try_advisory_lock")) {
				return Promise.resolve([{ locked }]);
			}
			return Promise.resolve([]);
		});
	tag.release = vi.fn();
	return tag;
};

const {
	withConfigWriteLock,
	collectSecretValues,
	redactSecrets,
	stripImageDigest,
	vectorServiceSpecUnchanged,
	buildServiceSettings,
} = await import("@dokploy/server/setup/vector-setup");

describe("withConfigWriteLock — cross-process guard (session scoped pg_advisory_lock)", () => {
	beforeEach(() => {
		mocks.reserve.mockReset();
	});

	it("runs fn and returns its result when the advisory lock is acquired", async () => {
		const reserved = makeReservedMock(true);
		mocks.reserve.mockResolvedValue(reserved);
		const fn = vi.fn().mockResolvedValue("ok");

		await expect(withConfigWriteLock("server-1", fn)).resolves.toBe("ok");
		expect(fn).toHaveBeenCalledTimes(1);
		const joinedCalls = reserved.mock.calls.map((call: any[]) =>
			(call[0] as string[]).join(""),
		);
		expect(
			joinedCalls.some((text: string) => text.includes("pg_advisory_unlock")),
		).toBe(true);
		expect(reserved.release).toHaveBeenCalledTimes(1);
	});

	it("retries, then throws without ever calling fn, when another process keeps holding the lock", async () => {
		mocks.reserve.mockImplementation(async () => makeReservedMock(false));
		const fn = vi.fn();

		await expect(withConfigWriteLock("server-1", fn)).rejects.toThrow(
			/already in progress/i,
		);
		expect(fn).not.toHaveBeenCalled();
		expect(mocks.reserve).toHaveBeenCalledTimes(3);
	}, 10_000);

	it("still serializes two calls for the same serverId within this process", async () => {
		mocks.reserve.mockImplementation(async () => makeReservedMock(true));
		const order: string[] = [];
		const slow = async (label: string, ms: number) => {
			order.push(`${label}:start`);
			await new Promise((resolve) => setTimeout(resolve, ms));
			order.push(`${label}:end`);
			return label;
		};

		const first = withConfigWriteLock("server-a", () => slow("first", 20));
		const second = withConfigWriteLock("server-a", () => slow("second", 1));
		await Promise.all([first, second]);

		expect(order).toEqual([
			"first:start",
			"first:end",
			"second:start",
			"second:end",
		]);
	});
});

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

describe("stripImageDigest", () => {
	it("drops an @sha256 digest suffix", () => {
		expect(
			stripImageDigest("timberio/vector:latest-alpine@sha256:abc123"),
		).toBe("timberio/vector:latest-alpine");
	});

	it("returns the image unchanged when there's no digest", () => {
		expect(stripImageDigest("timberio/vector:latest-alpine")).toBe(
			"timberio/vector:latest-alpine",
		);
	});
});

describe("vectorServiceSpecUnchanged", () => {
	const settings = {
		TaskTemplate: {
			ContainerSpec: {
				Image: "timberio/vector:latest-alpine",
				Args: ["--config", "/etc/vector/vector.yaml", "--watch-config"],
				Mounts: [{ Type: "bind", Source: "/a", Target: "/b" }],
			},
			Networks: [{ Target: "host" }],
		},
		Mode: { Replicated: { Replicas: 1 } },
	} as any;

	it("is unchanged when inspect matches settings modulo an image digest suffix and a resolved network ID", () => {
		const inspect = {
			Spec: {
				TaskTemplate: {
					ContainerSpec: {
						Image: "timberio/vector:latest-alpine@sha256:deadbeef",
						Args: ["--config", "/etc/vector/vector.yaml", "--watch-config"],
						Mounts: [{ Type: "bind", Source: "/a", Target: "/b" }],
					},
					Networks: [{ Target: "k1vw5h40twado5nnk9n2hi8nt" }],
				},
				Mode: { Replicated: { Replicas: 1 } },
			},
		} as any;
		expect(vectorServiceSpecUnchanged(inspect, settings)).toBe(true);
	});

	it("is changed when a bind mount source differs", () => {
		const inspect = {
			Spec: {
				TaskTemplate: {
					ContainerSpec: {
						Image: "timberio/vector:latest-alpine",
						Args: ["--config", "/etc/vector/vector.yaml", "--watch-config"],
						Mounts: [{ Type: "bind", Source: "/old-path", Target: "/b" }],
					},
					Networks: [{ Target: "host" }],
				},
				Mode: { Replicated: { Replicas: 1 } },
			},
		} as any;
		expect(vectorServiceSpecUnchanged(inspect, settings)).toBe(false);
	});

	it("is changed when Mode differs", () => {
		const inspect = {
			Spec: {
				TaskTemplate: settings.TaskTemplate,
				Mode: { Global: {} },
			},
		} as any;
		expect(vectorServiceSpecUnchanged(inspect, settings)).toBe(false);
	});
});

describe("buildServiceSettings", () => {
	it("bind-mounts the config directory, not the vector.yaml file itself", () => {
		const settings = buildServiceSettings("/etc/dokploy/vector") as any;
		const mounts = settings.TaskTemplate.ContainerSpec.Mounts as Array<{
			Source: string;
			Target: string;
		}>;
		const configMount = mounts.find((m) => m.Target === "/etc/vector");
		expect(configMount?.Source).toBe("/etc/dokploy/vector");
		expect(mounts.some((m) => m.Target === "/etc/vector/vector.yaml")).toBe(
			false,
		);
		expect(settings.TaskTemplate.ContainerSpec.Args).toContain(
			"/etc/vector/vector.yaml",
		);
	});
});

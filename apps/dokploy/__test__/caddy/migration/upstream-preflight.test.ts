import { fs, vol } from "memfs";
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("node:fs", () => ({
	...fs,
	default: fs,
}));

const execAsyncMock = vi.hoisted(() => vi.fn());
const execAsyncRemoteMock = vi.hoisted(() => vi.fn());

vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	execAsync: execAsyncMock,
	execAsyncRemote: execAsyncRemoteMock,
}));

import type { CaddyMigrationReport, CaddyRouteFragment } from "@dokploy/server";
import {
	getCaddyMigrationArtifactPaths,
	runCaddyMigrationUpstreamPreflight,
} from "@dokploy/server";

const createReport = (migrationId: string): CaddyMigrationReport => {
	const artifactPaths = getCaddyMigrationArtifactPaths(migrationId);
	return {
		migrationId,
		serverId: null,
		createdAt: "2026-05-22T00:00:00.000Z",
		updatedAt: "2026-05-22T00:00:00.000Z",
		status: "prepared",
		sourceProvider: "traefik",
		targetProvider: "caddy",
		artifactPaths,
		inputs: {
			traefikStaticConfigPath: "",
			traefikStaticConfigFound: true,
			dynamicFiles: [],
			dbApplicationDomains: 0,
			dbComposeDomains: 0,
			composeFilesScanned: [],
			composeFilesSkipped: [],
		},
		summary: {
			fragments: 1,
			routes: 1,
			warnings: 0,
			blockingWarnings: 0,
		},
		validation: { status: "passed", message: "ok" },
		warnings: [],
		events: [],
	};
};

const writeFragment = (
	report: CaddyMigrationReport,
	fragment: CaddyRouteFragment,
) => {
	vol.mkdirSync(report.artifactPaths.fragmentsDir, { recursive: true });
	vol.writeFileSync(
		`${report.artifactPaths.fragmentsDir}/${fragment.id}.json`,
		`${JSON.stringify(fragment, null, 2)}\n`,
	);
};

describe("Caddy migration upstream preflight", () => {
	beforeEach(() => {
		vol.reset();
		vi.clearAllMocks();
		execAsyncMock.mockResolvedValue({ stdout: "passed\n", stderr: "" });
		execAsyncRemoteMock.mockResolvedValue({ stdout: "passed\n", stderr: "" });
	});

	test("deduplicates upstream probes while preserving every route reference", async () => {
		const report = createReport("caddy-preflight-dedupe");
		writeFragment(report, {
			version: 1,
			id: "manual",
			source: "manual",
			routes: [
				{
					id: "route-a",
					source: "manual",
					hosts: ["a.example.com"],
					upstreams: ["http://app:3000"],
				},
				{
					id: "route-b",
					source: "manual",
					hosts: ["b.example.com"],
					upstreams: ["http://app:3000"],
				},
			],
		});

		const preflight = await runCaddyMigrationUpstreamPreflight(report);

		expect(preflight.status).toBe("passed");
		expect(execAsyncMock).toHaveBeenCalledTimes(1);
		expect(preflight.checks).toHaveLength(1);
		expect(preflight.checks[0]).toMatchObject({
			dial: "app:3000",
			host: "app",
			port: 3000,
			network: "dokploy-network",
			status: "passed",
			routes: [
				expect.objectContaining({ routeId: "route-a" }),
				expect.objectContaining({ routeId: "route-b" }),
			],
		});
	});

	test("reports invalid no-port upstreams without running Docker", async () => {
		const report = createReport("caddy-preflight-invalid");
		writeFragment(report, {
			version: 1,
			id: "manual",
			source: "manual",
			routes: [
				{
					id: "admin",
					source: "manual",
					hosts: ["admin.example.com"],
					upstreams: ["http://admin"],
				},
			],
		});

		const preflight = await runCaddyMigrationUpstreamPreflight(report);

		expect(preflight.status).toBe("failed");
		expect(execAsyncMock).not.toHaveBeenCalled();
		expect(preflight.checks[0]).toMatchObject({
			dial: "http://admin",
			network: "dokploy-network",
			status: "failed",
			reason: expect.stringContaining("explicit port"),
			routes: [expect.objectContaining({ routeId: "admin" })],
		});
	});

	test("records DNS and TCP probe failures with route context", async () => {
		const report = createReport("caddy-preflight-dns");
		writeFragment(report, {
			version: 1,
			id: "manual",
			source: "manual",
			routes: [
				{
					id: "missing",
					source: "manual",
					hosts: ["missing.example.com"],
					upstreams: ["http://missing:3000"],
				},
			],
		});
		execAsyncMock.mockRejectedValueOnce(
			Object.assign(new Error("probe failed"), { stdout: "dns_failed\n" }),
		);

		const preflight = await runCaddyMigrationUpstreamPreflight(report);

		expect(preflight.status).toBe("failed");
		expect(preflight.checks[0]).toMatchObject({
			dial: "missing:3000",
			host: "missing",
			port: 3000,
			network: "dokploy-network",
			status: "failed",
			reason: "DNS resolution failed",
			routes: [expect.objectContaining({ routeId: "missing" })],
		});
	});

	test("probes identical dials separately when route networks differ", async () => {
		const report = createReport("caddy-preflight-networks");
		writeFragment(report, {
			version: 1,
			id: "manual",
			source: "manual",
			routes: [
				{
					id: "shared-a",
					source: "manual",
					hosts: ["a.example.com"],
					upstreams: ["http://web:8080"],
					upstreamNetwork: "project-a",
				},
				{
					id: "shared-b",
					source: "manual",
					hosts: ["b.example.com"],
					upstreams: ["http://web:8080"],
					upstreamNetwork: "project-b",
				},
			],
		});

		const preflight = await runCaddyMigrationUpstreamPreflight(report);

		expect(preflight.status).toBe("passed");
		expect(preflight.network).toBe("mixed");
		expect(preflight.networks).toEqual(["project-a", "project-b"]);
		expect(preflight.checks).toHaveLength(2);
		expect(execAsyncMock).toHaveBeenCalledTimes(2);
		expect(execAsyncMock.mock.calls[0]?.[0]).toContain("--network project-a");
		expect(execAsyncMock.mock.calls[1]?.[0]).toContain("--network project-b");
	});

	test("uses a one-shot container probe on the route network", async () => {
		const report = createReport("caddy-preflight-service");
		writeFragment(report, {
			version: 1,
			id: "manual",
			source: "manual",
			routes: [
				{
					id: "app",
					source: "manual",
					hosts: ["app.example.com"],
					upstreams: ["http://app:3000"],
				},
			],
		});
		execAsyncMock.mockResolvedValueOnce({ stdout: "passed\n", stderr: "" });

		const preflight = await runCaddyMigrationUpstreamPreflight(report);

		expect(preflight.status).toBe("passed");
		expect(preflight.probeMode).toBe("standalone");
		expect(execAsyncMock.mock.calls[0]?.[0]).toContain("docker run --rm");
		expect(execAsyncMock.mock.calls[0]?.[0]).toContain(
			"--network dokploy-network",
		);
	});

	test("falls back to a temporary service probe when the overlay network is not attachable", async () => {
		const report = createReport("caddy-preflight-service-fallback");
		writeFragment(report, {
			version: 1,
			id: "manual",
			source: "manual",
			routes: [
				{
					id: "app",
					source: "manual",
					hosts: ["app.example.com"],
					upstreams: ["http://app:3000"],
				},
			],
		});
		execAsyncMock
			.mockRejectedValueOnce(
				Object.assign(new Error("docker run failed"), {
					stderr:
						"Error response from daemon: network dokploy-network is not manually attachable",
				}),
			)
			.mockResolvedValueOnce({ stdout: "passed\n", stderr: "" });

		const preflight = await runCaddyMigrationUpstreamPreflight(report);

		expect(preflight.status).toBe("passed");
		expect(preflight.probeMode).toBe("service");
		expect(execAsyncMock).toHaveBeenCalledTimes(2);
		expect(execAsyncMock.mock.calls[0]?.[0]).toContain("docker run --rm");
		expect(execAsyncMock.mock.calls[1]?.[0]).toContain("docker service create");
	});
});

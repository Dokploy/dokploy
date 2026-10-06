import {
	DockerResourceNotFoundError,
	isTraefikDashboardPortEnabled,
	readPorts,
} from "@dokploy/server/services/settings";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	execAsync: vi.fn(),
	execAsyncRemote: vi.fn(),
}));

vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	execAsync: mocks.execAsync,
	execAsyncRemote: mocks.execAsyncRemote,
}));

/**
 * `readPorts` first asks docker what kind of resource it is (the multi-line
 * "service / standalone / unknown" probe), then inspects it. Route the mocked
 * shell by command so each test only describes the docker side.
 */
const mockDocker = ({
	resourceType,
	ports,
}: {
	resourceType: "service" | "standalone" | "unknown";
	ports?: unknown;
}) => {
	const handler = async (...args: string[]) => {
		const command = args[args.length - 1] ?? "";
		if (command.includes('RESOURCE_NAME="')) {
			return { stdout: `${resourceType}\n`, stderr: "" };
		}
		return { stdout: `${JSON.stringify(ports)}\n`, stderr: "" };
	};
	mocks.execAsync.mockImplementation(handler);
	mocks.execAsyncRemote.mockImplementation(handler);
};

describe("readPorts (standalone container)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("treats a null mapping (exposed but not published) as not published", async () => {
		mockDocker({
			resourceType: "standalone",
			ports: {
				"8080/tcp": null,
				"3000/tcp": [{ HostIp: "0.0.0.0", HostPort: "3000" }],
			},
		});

		await expect(readPorts("dokploy-traefik")).resolves.toEqual([
			{ targetPort: 3000, publishedPort: 3000, protocol: "tcp" },
		]);
	});

	it("returns no ports when every port is exposed but unpublished", async () => {
		mockDocker({
			resourceType: "standalone",
			ports: { "8080/tcp": null, "9000/udp": [] },
		});

		await expect(readPorts("dokploy-traefik")).resolves.toEqual([]);
	});

	it("keeps only the first mapping when IPv4 and IPv6 are both published", async () => {
		mockDocker({
			resourceType: "standalone",
			ports: {
				"8080/tcp": [
					{ HostIp: "0.0.0.0", HostPort: "8080" },
					{ HostIp: "::", HostPort: "8080" },
				],
			},
		});

		await expect(readPorts("dokploy-traefik")).resolves.toEqual([
			{ targetPort: 8080, publishedPort: 8080, protocol: "tcp" },
		]);
	});

	it("throws a DockerResourceNotFoundError when the resource does not exist", async () => {
		mockDocker({ resourceType: "unknown" });

		const error = await readPorts("dokploy-traefik").catch((e) => e);

		expect(error).toBeInstanceOf(DockerResourceNotFoundError);
		expect(error.message).toBe("Resource type not found");
	});
});

describe("isTraefikDashboardPortEnabled", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns false instead of throwing when Traefik is not installed", async () => {
		mockDocker({ resourceType: "unknown" });

		await expect(isTraefikDashboardPortEnabled()).resolves.toBe(false);
		await expect(isTraefikDashboardPortEnabled("server-1")).resolves.toBe(
			false,
		);
	});

	it("returns false when port 8080 is exposed but not published", async () => {
		mockDocker({ resourceType: "standalone", ports: { "8080/tcp": null } });

		await expect(isTraefikDashboardPortEnabled()).resolves.toBe(false);
	});

	it("returns true when port 8080 is published", async () => {
		mockDocker({
			resourceType: "standalone",
			ports: { "8080/tcp": [{ HostIp: "0.0.0.0", HostPort: "8080" }] },
		});

		await expect(isTraefikDashboardPortEnabled()).resolves.toBe(true);
	});

	it("returns true for a swarm service publishing 8080", async () => {
		mockDocker({
			resourceType: "service",
			ports: [{ TargetPort: 8080, PublishedPort: 8080, Protocol: "tcp" }],
		});

		await expect(isTraefikDashboardPortEnabled()).resolves.toBe(true);
	});

	it("still propagates unrelated failures", async () => {
		mocks.execAsync.mockImplementation(async (command: string) => {
			if (command.includes('RESOURCE_NAME="')) {
				return { stdout: "standalone\n", stderr: "" };
			}
			throw new Error("docker daemon unreachable");
		});

		await expect(isTraefikDashboardPortEnabled()).rejects.toThrow(
			"docker daemon unreachable",
		);
	});
});

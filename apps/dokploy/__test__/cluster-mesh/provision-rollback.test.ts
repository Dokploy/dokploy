import { db } from "@dokploy/server/db";
import { retryClusterNode } from "@dokploy/server/services/cluster-mesh/provision";
import { execOverSsh } from "@dokploy/server/services/cluster-mesh/ssh";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@dokploy/server/services/cluster-mesh/ssh", () => ({
	execOverSsh: vi.fn(),
}));

const node = (overrides: Record<string, unknown>) => ({
	clusterNodeId: "n-worker",
	meshId: "mesh-1",
	name: "worker-1",
	role: "worker",
	status: "error",
	sshAddress: "10.0.0.2",
	sshPort: 22,
	sshUser: "root",
	sshKey: { privateKey: "key" },
	swarmNodeId: null,
	wgPublicKey: null,
	wgAddress: "100.96.0.2",
	endpointAddress: "10.0.0.2",
	...overrides,
});

const mesh = {
	meshId: "mesh-1",
	serverId: null,
	subnet: "100.96.0.0/24",
	listenPort: 51820,
	wgMtu: 1420,
	managerAdvertiseAddress: "100.96.0.1",
	nodes: [
		node({
			clusterNodeId: "n-manager",
			name: "manager",
			role: "manager",
			status: "active",
		}),
		node({}),
	],
};

const hostFacts = (extra: string) =>
	`os=ubuntu\nosVersion=24.04\nsystemd=yes\ndocker=29.4.2\nunderlayMtu=1500\ntailscale=no\nroutes=\n${extra}\n`;

const sshBodies = () => vi.mocked(execOverSsh).mock.calls.map((call) => call[1]);
const ranLeave = () =>
	sshBodies().some((body) => body.includes("docker swarm leave --force"));

describe("adding a VM that fails", () => {
	beforeEach(() => {
		vi.mocked(execOverSsh).mockReset();
		vi.spyOn(console, "error").mockImplementation(() => {});
		const findFirst = vi.mocked(db.query.clusterNode.findFirst);
		findFirst.mockReset();
		findFirst.mockResolvedValueOnce(node({}) as never);
		findFirst.mockResolvedValue(mesh as never);
	});

	it("never makes a VM leave the swarm it already belongs to", async () => {
		vi.mocked(execOverSsh).mockResolvedValue({
			stdout: hostFacts("swarm=active\nswarmNodeId=someone-elses-node"),
			stderr: "",
		} as never);

		await retryClusterNode("n-worker");
		await vi.waitFor(() => expect(console.error).toHaveBeenCalled());

		expect(ranLeave()).toBe(false);
		expect(sshBodies().some((body) => body.includes("wg-quick"))).toBe(false);
	});

	it("rolls back what it changed once the checks have passed", async () => {
		vi.mocked(execOverSsh).mockImplementation(async (_target, body) => {
			if (body.includes('echo "os=$ID"')) {
				return { stdout: hostFacts("swarm=inactive"), stderr: "" } as never;
			}
			if (body.includes("wg genkey")) throw new Error("boom");
			return { stdout: "", stderr: "" } as never;
		});

		await retryClusterNode("n-worker");
		await vi.waitFor(() => expect(ranLeave()).toBe(true));
	});
});

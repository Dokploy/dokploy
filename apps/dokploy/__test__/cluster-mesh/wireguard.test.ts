import {
	applyConfigScript,
	CLUSTER_DOCKER_VERSION,
	CLUSTER_DOCKER_VERSION_UBUNTU_26_04,
	installDockerScript,
	joinSwarmScript,
	parseFacts,
	pathCheckScript,
	registryLoginScript,
} from "@dokploy/server/services/cluster-mesh/scripts";
import {
	allocateAddress,
	computeWgMtu,
	type MeshLayout,
	managerAddress,
	normalizeSubnet,
	PRIVATE_KEY_PLACEHOLDER,
	renderMemberConfig,
	subnetsOverlap,
} from "@dokploy/server/services/cluster-mesh/wireguard";
import { describe, expect, it } from "vitest";

describe("addresses", () => {
	it("gives the manager the first host and workers the next free ones", () => {
		expect(managerAddress("100.96.0.0/24")).toBe("100.96.0.1");
		expect(allocateAddress("100.96.0.0/24", ["100.96.0.1"])).toBe("100.96.0.2");
		expect(
			allocateAddress("100.96.0.0/24", [
				"100.96.0.1",
				"100.96.0.2",
				"100.96.0.4",
			]),
		).toBe("100.96.0.3");
	});

	it("never hands out the broadcast address and reports exhaustion", () => {
		const used = Array.from({ length: 6 }, (_, i) => `10.9.0.${i + 1}`);
		expect(() => allocateAddress("10.9.0.0/29", used)).toThrow(
			/No free address/,
		);
	});

	it("normalises and compares subnets", () => {
		expect(normalizeSubnet("100.96.0.77/24")).toBe("100.96.0.0/24");
		expect(subnetsOverlap("100.96.0.0/24", "100.64.0.0/10")).toBe(true);
		expect(subnetsOverlap("100.96.0.0/24", "10.0.0.0/8")).toBe(false);
		expect(subnetsOverlap("10.0.1.0/24", "10.0.0.0/8")).toBe(true);
		expect(subnetsOverlap("100.96.0.0/24", "172.20.0.2/32")).toBe(false);
		expect(subnetsOverlap("100.96.0.0/24", "100.96.0.9/32")).toBe(true);
		expect(subnetsOverlap("100.96.0.0/24", "0.0.0.0/0")).toBe(true);
		expect(() => normalizeSubnet("300.1.1.1/24")).toThrow();
	});

	it("sizes the tunnel MTU from the smallest underlay", () => {
		expect(computeWgMtu([1500])).toBe(1420);
		expect(computeWgMtu([1500, 1460])).toBe(1380);
		expect(computeWgMtu([9001])).toBe(1420);
		expect(computeWgMtu([1300])).toBe(1280);
		expect(computeWgMtu([Number.NaN])).toBe(1420);
	});
});

const layout: MeshLayout = {
	subnet: "100.96.0.0/24",
	listenPort: 51820,
	mtu: 1420,
	managerAdvertiseAddress: "10.0.0.5",
	members: [
		{
			role: "manager",
			wgAddress: "100.96.0.1",
			wgPublicKey: "MANAGERKEY=",
			endpointAddress: "203.0.113.1",
		},
		{
			role: "worker",
			wgAddress: "100.96.0.2",
			wgPublicKey: "WORKER2KEY=",
			endpointAddress: "198.51.100.7",
		},
		{
			role: "worker",
			wgAddress: "100.96.0.3",
			wgPublicKey: null,
			endpointAddress: "2001:db8::3",
		},
	],
};

describe("renderMemberConfig", () => {
	it("makes the manager send tunnel traffic from its swarm address", () => {
		const config = renderMemberConfig(layout.members[0]!, layout);
		expect(config).toContain("Address = 100.96.0.1/24");
		expect(config).toContain(
			"PostUp = ip route replace 100.96.0.0/24 dev %i src 10.0.0.5",
		);
		expect(config).toContain(`PrivateKey = ${PRIVATE_KEY_PLACEHOLDER}`);
		expect(config).not.toContain("Table = off");
		expect(config).toContain("PublicKey = WORKER2KEY=");
		expect(config).toContain("AllowedIPs = 100.96.0.2/32");
		// A member without a key yet is not a peer.
		expect(config).not.toContain("100.96.0.3");
	});

	it("routes the manager's swarm address through the tunnel on workers", () => {
		const config = renderMemberConfig(layout.members[1]!, layout);
		expect(config).toContain("Table = off");
		expect(config).toContain("FwMark = 51820");
		expect(config).toContain(
			"PostUp = ip rule add fwmark 51820 lookup main priority 100",
		);
		expect(config).toContain(
			"PostUp = ip rule add to 10.0.0.5/32 lookup 51820 priority 101",
		);
		expect(config).toContain(
			"PostUp = ip route replace 10.0.0.5/32 dev %i table 51820",
		);
		expect(config).toContain("AllowedIPs = 100.96.0.1/32, 10.0.0.5/32");
		expect(config).toContain("Endpoint = 203.0.113.1:51820");
		expect(config).not.toContain("WORKER2KEY=");
	});

	it("brackets IPv6 endpoints", () => {
		const withKey = {
			...layout,
			members: layout.members.map((member) => ({
				...member,
				wgPublicKey: member.wgPublicKey ?? "WORKER3KEY=",
			})),
		};
		const config = renderMemberConfig(withKey.members[0]!, withKey);
		expect(config).toContain("Endpoint = [2001:db8::3]:51820");
	});
});

describe("scripts", () => {
	it("reads the join token from stdin, never from the command line", () => {
		const script = joinSwarmScript({
			wgAddress: "100.96.0.2",
			managerAddress: "10.0.0.5",
		});
		expect(script).toContain("read -r TOKEN");
		expect(script).toContain('--token "$TOKEN"');
		expect(script).toContain("--advertise-addr 100.96.0.2");
		expect(script).toContain("--data-path-addr 100.96.0.2");
		expect(script).toContain("--listen-addr 100.96.0.2:2377");
		expect(script).toContain("--availability pause");
		expect(script).toContain("10.0.0.5:2377");
		expect(script).not.toMatch(/SWMTKN/);
	});

	it("installs a Docker version that the VM's Ubuntu release ships", () => {
		const script = installDockerScript();
		expect(script).toContain(`version=${CLUSTER_DOCKER_VERSION}`);
		expect(script).toContain(
			`if [ "$ID" = "ubuntu" ] && [ "$VERSION_ID" = "26.04" ]; then\n\t\tversion=${CLUSTER_DOCKER_VERSION_UBUNTU_26_04}`,
		);
		expect(script).toContain('sh -s -- --version "$version"');
		expect(script).toContain("Docker is already installed.");
	});

	it("waits for the tunnel before the full-size check, and says which part failed", () => {
		const script = pathCheckScript("100.96.0.1", 1420, 51820);
		expect(script).toContain("deadline=$(($(date +%s) + 20))");
		expect(script).toContain("until ping -c 1 -W 2 100.96.0.1");
		expect(script).toContain(
			"No answer from 100.96.0.1 through the tunnel within 20 seconds: UDP 51820",
		);
		expect(script).toContain("ping -c 3 -W 2 -M do -s 1392 100.96.0.1");
		expect(script).toContain("not to unfragmented 1420-byte packets");
		expect(script).toContain('echo "ok: 100.96.0.1 at MTU 1420"');
	});

	it("reads registry passwords from stdin", () => {
		const script = registryLoginScript("ghcr.io", "dokploy");
		expect(script).toContain("read -r PASSWORD");
		expect(script).toContain("--password-stdin");
	});

	it("ships the config without the key and fills the key in on the node", () => {
		const config = renderMemberConfig(layout.members[1]!, layout);
		const script = applyConfigScript(config, 1420);
		expect(script).not.toContain("PrivateKey =");
		expect(script).toContain(`s|${PRIVATE_KEY_PLACEHOLDER}|`);
		expect(script).toContain("wg syncconf wg-dokploy");
		expect(script).toContain("systemctl enable --now wg-quick@wg-dokploy");
		const encoded = script.match(
			/echo '?([A-Za-z0-9+/=]+)'? \| base64 -d/,
		)?.[1];
		expect(Buffer.from(encoded ?? "", "base64").toString()).toBe(config);
	});

	it("parses key=value facts", () => {
		expect(
			parseFacts(
				"os=ubuntu\nosVersion=24.04\nnoise\nroutes=10.0.0.0/24 172.17.0.0/16 ",
			),
		).toEqual({
			os: "ubuntu",
			osVersion: "24.04",
			routes: "10.0.0.0/24 172.17.0.0/16",
		});
	});
});

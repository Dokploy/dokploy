export const WG_INTERFACE = "wg-dokploy";
export const WG_FWMARK = 51820;
// The private key never leaves its node: configs are rendered with this
// placeholder and the node substitutes its own key when writing the file.
export const PRIVATE_KEY_PLACEHOLDER = "__DOKPLOY_PRIVATE_KEY__";

const MIN_MTU = 1280;
const MAX_WG_MTU = 1420;
// IPv6 outer header (40) + UDP (8) + WireGuard (32): the worst case, so the
// tunnel never needs fragmenting whichever family the underlay uses.
const WG_OVERHEAD = 80;

export interface Subnet {
	network: number;
	prefix: number;
	size: number;
}

export const ipToInt = (ip: string): number => {
	const parts = ip.split(".").map(Number);
	if (
		parts.length !== 4 ||
		parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
	) {
		throw new Error(`Invalid IPv4 address: ${ip}`);
	}
	return (
		(((parts[0] as number) << 24) >>> 0) +
		((parts[1] as number) << 16) +
		((parts[2] as number) << 8) +
		(parts[3] as number)
	);
};

export const intToIp = (value: number) =>
	[24, 16, 8, 0].map((shift) => (value >>> shift) & 255).join(".");

export const parseSubnet = (cidr: string): Subnet => {
	const [address, prefixText] = cidr.split("/");
	const prefix = Number(prefixText);
	if (!address || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) {
		throw new Error(`Invalid subnet: ${cidr}`);
	}
	const size = 2 ** (32 - prefix);
	const network = ipToInt(address) - (ipToInt(address) % size);
	return { network, prefix, size };
};

export const normalizeSubnet = (cidr: string) => {
	const { network, prefix } = parseSubnet(cidr);
	return `${intToIp(network)}/${prefix}`;
};

export const subnetsOverlap = (a: string, b: string) => {
	const first = parseSubnet(a);
	const second = parseSubnet(b);
	return (
		first.network < second.network + second.size &&
		second.network < first.network + first.size
	);
};

/** The manager always takes the first host address of the subnet. */
export const managerAddress = (cidr: string) =>
	intToIp(parseSubnet(cidr).network + 1);

export const allocateAddress = (cidr: string, used: string[]) => {
	const { network, size } = parseSubnet(cidr);
	const taken = new Set(used);
	for (let host = 2; host < size - 1; host++) {
		const candidate = intToIp(network + host);
		if (!taken.has(candidate)) return candidate;
	}
	throw new Error(`No free address left in ${cidr}`);
};

export const computeWgMtu = (underlayMtus: number[]) => {
	const known = underlayMtus.filter((mtu) => Number.isFinite(mtu) && mtu > 0);
	if (known.length === 0) return MAX_WG_MTU;
	return Math.max(
		MIN_MTU,
		Math.min(MAX_WG_MTU, Math.min(...known) - WG_OVERHEAD),
	);
};

const formatEndpoint = (host: string, port: number) =>
	host.includes(":") && !host.startsWith("[")
		? `[${host}]:${port}`
		: `${host}:${port}`;

export interface MeshMember {
	role: "manager" | "worker";
	wgAddress: string;
	wgPublicKey: string | null;
	endpointAddress: string;
}

export interface MeshLayout {
	subnet: string;
	listenPort: number;
	mtu: number;
	/** The address the swarm already knows the manager by. */
	managerAdvertiseAddress: string;
	members: MeshMember[];
}

const peerBlock = (
	peer: MeshMember,
	layout: MeshLayout,
	forWorker: boolean,
) => {
	const allowed = [`${peer.wgAddress}/32`];
	// Workers reach the manager at its swarm address through the tunnel.
	if (forWorker && peer.role === "manager") {
		allowed.push(`${layout.managerAdvertiseAddress}/32`);
	}
	return [
		"[Peer]",
		`PublicKey = ${peer.wgPublicKey}`,
		`Endpoint = ${formatEndpoint(peer.endpointAddress, layout.listenPort)}`,
		`AllowedIPs = ${allowed.join(", ")}`,
		"PersistentKeepalive = 25",
	].join("\n");
};

/**
 * wg-quick configuration for one member, with every other member that has a
 * key as a peer.
 *
 * The manager keeps the address the swarm was created with; changing it in
 * place leaves Swarm's raft record on the old address. Workers therefore
 * route that address through the tunnel (policy routing on the WireGuard
 * fwmark, so the tunnel's own packets to the same IP still use the normal
 * route), and the manager sends tunnel traffic from that address so gossip
 * and VXLAN arrive from the address peers know it by.
 */
export const renderMemberConfig = (self: MeshMember, layout: MeshLayout) => {
	const { prefix } = parseSubnet(layout.subnet);
	const network = intToIp(parseSubnet(layout.subnet).network);
	const isWorker = self.role === "worker";
	const manager = layout.managerAdvertiseAddress;
	const iface = [
		"# Managed by Dokploy; changes are overwritten.",
		"[Interface]",
		`Address = ${self.wgAddress}/${prefix}`,
		`ListenPort = ${layout.listenPort}`,
		`MTU = ${layout.mtu}`,
		`PrivateKey = ${PRIVATE_KEY_PLACEHOLDER}`,
		...(isWorker
			? [
					"Table = off",
					`FwMark = ${WG_FWMARK}`,
					`PostUp = ip rule add fwmark ${WG_FWMARK} lookup main priority 100`,
					`PostUp = ip rule add to ${manager}/32 lookup ${WG_FWMARK} priority 101`,
					`PostUp = ip route replace ${manager}/32 dev %i table ${WG_FWMARK}`,
					`PostDown = ip rule del fwmark ${WG_FWMARK} lookup main priority 100`,
					`PostDown = ip rule del to ${manager}/32 lookup ${WG_FWMARK} priority 101`,
				]
			: [
					`PostUp = ip route replace ${network}/${prefix} dev %i src ${manager}`,
				]),
	];
	const peers = layout.members
		.filter(
			(member) => member.wgAddress !== self.wgAddress && member.wgPublicKey,
		)
		.map((member) => peerBlock(member, layout, isWorker));
	return `${[iface.join("\n"), ...peers].join("\n\n")}\n`;
};

/** Makes Docker wait for the tunnel at boot: Swarm cannot bind its WireGuard
 * address before the interface exists and does not retry. */
export const DOCKER_DROP_IN = `[Unit]
Wants=wg-quick@${WG_INTERFACE}.service
After=wg-quick@${WG_INTERFACE}.service
`;

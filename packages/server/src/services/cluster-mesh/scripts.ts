import { quote } from "shell-quote";
import { encodeBase64 } from "../../utils/docker/utils";
import {
	DOCKER_DROP_IN,
	PRIVATE_KEY_PLACEHOLDER,
	WG_INTERFACE,
} from "./wireguard";

// Same pins as server-setup.ts, so a swarm's nodes run one version wherever
// the distribution allows it. Docker's Ubuntu 26.04 repository starts at 29.x,
// and get.docker.com aborts when the pinned version is missing; 29.4.2 is the
// newest version it carries for every architecture.
export const CLUSTER_DOCKER_VERSION = "28.5.0";
export const CLUSTER_DOCKER_VERSION_UBUNTU_26_04 = "29.4.2";

const KEY_FILE = `/etc/wireguard/${WG_INTERFACE}.key`;
const CONFIG_FILE = `/etc/wireguard/${WG_INTERFACE}.conf`;
const DROP_IN_FILE =
	"/etc/systemd/system/docker.service.d/10-dokploy-wireguard.conf";

const PRELUDE = `set -e
if [ "$(id -u)" -eq 0 ]; then
	SUDO=""
elif sudo -n true 2>/dev/null; then
	SUDO="sudo"
else
	echo "The SSH user needs root or passwordless sudo." >&2
	exit 1
fi`;

const script = (body: string) => `${PRELUDE}\n${body}\n`;

/** Key=value facts about a host, parsed by `parseFacts`. */
export const inspectHostScript = () =>
	script(`. /etc/os-release
echo "os=$ID"
echo "osVersion=$VERSION_ID"
if command -v docker >/dev/null 2>&1; then
	echo "docker=$($SUDO docker version --format '{{.Server.Version}}' 2>/dev/null || echo unknown)"
	echo "swarm=$($SUDO docker info --format '{{.Swarm.LocalNodeState}}' 2>/dev/null)"
	echo "swarmNodeAddr=$($SUDO docker info --format '{{.Swarm.NodeAddr}}' 2>/dev/null)"
	echo "swarmNodeId=$($SUDO docker info --format '{{.Swarm.NodeID}}' 2>/dev/null)"
else
	echo "docker="
fi
dev=$(ip -4 route show default | awk '{for (i = 1; i < NF; i++) if ($i == "dev") print $(i + 1); exit}')
echo "underlayMtu=$(cat /sys/class/net/$dev/mtu 2>/dev/null)"
echo "tailscale=$(ip link show tailscale0 >/dev/null 2>&1 && echo yes || echo no)"
echo "routes=$(ip -4 route show | awk '$1 ~ /\\// {print $1}' | tr '\\n' ' ')"
echo "systemd=$(command -v systemctl >/dev/null 2>&1 && echo yes || echo no)"`);

export const parseFacts = (output: string) => {
	const facts: Record<string, string> = {};
	for (const line of output.split("\n")) {
		const separator = line.indexOf("=");
		if (separator > 0) {
			facts[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
		}
	}
	return facts;
};

export const installDockerScript = () =>
	script(`if command -v docker >/dev/null 2>&1; then
	echo "Docker is already installed."
else
	. /etc/os-release
	version=${CLUSTER_DOCKER_VERSION}
	if [ "$ID" = "ubuntu" ] && [ "$VERSION_ID" = "26.04" ]; then
		version=${CLUSTER_DOCKER_VERSION_UBUNTU_26_04}
	fi
	echo "Installing Docker $version..."
	curl -fsSL https://get.docker.com | $SUDO sh -s -- --version "$version"
fi
$SUDO systemctl enable --now docker`);

/** Installs WireGuard, creates the node's key once, prints the public key. */
export const installWireguardScript = () =>
	script(`if ! command -v wg >/dev/null 2>&1 || ! command -v wg-quick >/dev/null 2>&1; then
	echo "Installing wireguard-tools..."
	$SUDO apt-get update -y >/dev/null
	DEBIAN_FRONTEND=noninteractive $SUDO apt-get install -y wireguard-tools iputils-ping >/dev/null
fi
$SUDO mkdir -p /etc/wireguard
if ! $SUDO test -s ${KEY_FILE}; then
	(umask 077; wg genkey | $SUDO tee ${KEY_FILE} >/dev/null)
fi
echo "publicKey=$($SUDO cat ${KEY_FILE} | wg pubkey)"`);

/**
 * Writes the rendered config with the node's own key and applies it. A
 * running interface is updated in place (`wg syncconf`), so existing
 * connections keep flowing while peers are added or removed.
 */
export const applyConfigScript = (config: string, mtu: number) =>
	script(`umask 077
echo ${quote([encodeBase64(config)])} | base64 -d \\
	| sed "s|${PRIVATE_KEY_PLACEHOLDER}|$($SUDO cat ${KEY_FILE})|" \\
	| $SUDO tee ${CONFIG_FILE}.tmp >/dev/null
$SUDO mv -f ${CONFIG_FILE}.tmp ${CONFIG_FILE}
$SUDO chmod 600 ${CONFIG_FILE}
if ip link show ${WG_INTERFACE} >/dev/null 2>&1; then
	$SUDO bash -c 'wg syncconf ${WG_INTERFACE} <(wg-quick strip ${WG_INTERFACE})'
	$SUDO ip link set ${WG_INTERFACE} mtu ${mtu}
else
	$SUDO systemctl enable --now wg-quick@${WG_INTERFACE}
fi
$SUDO systemctl enable wg-quick@${WG_INTERFACE} >/dev/null 2>&1`);

export const firewallScript = (listenPort: number) =>
	script(`if command -v ufw >/dev/null 2>&1 && $SUDO ufw status | grep -q "Status: active"; then
	$SUDO ufw allow ${listenPort}/udp >/dev/null
	$SUDO ufw allow in on ${WG_INTERFACE} >/dev/null
	echo "ufw: allowed ${listenPort}/udp and traffic on ${WG_INTERFACE}"
else
	echo "ufw is not active; check the provider's firewall allows ${listenPort}/udp."
fi`);

export const dockerBootOrderScript = () =>
	script(`$SUDO mkdir -p ${DROP_IN_FILE.slice(0, DROP_IN_FILE.lastIndexOf("/"))}
echo ${quote([encodeBase64(DOCKER_DROP_IN)])} | base64 -d | $SUDO tee ${DROP_IN_FILE} >/dev/null
$SUDO systemctl daemon-reload`);

/**
 * Waits for the tunnel to answer, because WireGuard resends a lost handshake
 * only every 5 seconds, then pings without fragmentation at the tunnel's full
 * packet size.
 */
export const pathCheckScript = (target: string, mtu: number, port: number) =>
	script(`deadline=$(($(date +%s) + 20))
until ping -c 1 -W 2 ${target} >/dev/null 2>&1; do
	if [ "$(date +%s)" -ge "$deadline" ]; then
		echo "No answer from ${target} through the tunnel within 20 seconds: UDP ${port} is not getting through between the VMs." >&2
		exit 1
	fi
	sleep 1
done
if ! ping -c 3 -W 2 -M do -s ${mtu - 28} ${target} >/dev/null 2>&1; then
	echo "${target} answers through the tunnel, but not to unfragmented ${mtu}-byte packets: the path between the VMs drops large packets." >&2
	exit 1
fi
echo "ok: ${target} at MTU ${mtu}"`);

/** The join token arrives on stdin so it never appears in a command line. */
export const joinSwarmScript = ({
	wgAddress,
	managerAddress,
}: {
	wgAddress: string;
	managerAddress: string;
}) =>
	script(`read -r TOKEN
if [ "$($SUDO docker info --format '{{.Swarm.LocalNodeState}}')" = "active" ]; then
	echo "Already part of a swarm."
else
	$SUDO docker swarm join --token "$TOKEN" \\
		--advertise-addr ${wgAddress} --data-path-addr ${wgAddress} \\
		--listen-addr ${wgAddress}:2377 --availability pause \\
		${managerAddress}:2377
fi
echo "swarmNodeId=$($SUDO docker info --format '{{.Swarm.NodeID}}')"`);

export const registryLoginScript = (registry: string, username: string) =>
	script(`read -r PASSWORD
printf '%s' "$PASSWORD" | $SUDO docker login ${quote([registry])} -u ${quote([username])} --password-stdin >/dev/null
echo "Logged in to ${registry}"`);

export const pullImageScript = (image: string) =>
	script(`$SUDO docker pull -q ${quote([image])}`);

export const leaveSwarmScript = () =>
	script(`if [ "$($SUDO docker info --format '{{.Swarm.LocalNodeState}}')" != "inactive" ]; then
	$SUDO docker swarm leave --force
fi`);

export const teardownScript = () =>
	script(`$SUDO systemctl disable --now wg-quick@${WG_INTERFACE} >/dev/null 2>&1 || true
$SUDO rm -f ${CONFIG_FILE} ${KEY_FILE} ${DROP_IN_FILE}
$SUDO systemctl daemon-reload`);

export const handshakesScript = () =>
	script(`$SUDO wg show ${WG_INTERFACE} latest-handshakes`);

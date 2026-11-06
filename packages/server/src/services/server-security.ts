import { createHash, randomBytes } from "node:crypto";
import { quote } from "shell-quote";
import ssh2 from "ssh2";
import { z } from "zod";
import { IS_CLOUD } from "../constants";
import { ExecError } from "../utils/process/ExecError";
import { execAsyncRemote } from "../utils/process/execAsync";
import { findServerById } from "./server";
import { getWebServerSettings } from "./web-server-settings";

const SUDO_PREAMBLE = `SUDO=""; if [ "$(id -u)" -ne 0 ]; then SUDO="sudo -n"; fi`;

const FAIL2BAN_CONFIG_PATH = "/etc/fail2ban/jail.d/dokploy.local";
const FAIL2BAN_DAEMON_CONFIG_PATH = "/etc/fail2ban/fail2ban.d/dokploy.local";
export const FAIL2BAN_MANUAL_JAIL = "dokploy-manual";
const SSHD_DROPIN_PATH = "/etc/ssh/sshd_config.d/00-dokploy.conf";
const SSHD_DROPIN_BACKUP_PATH = "/etc/ssh/sshd_config.d/.00-dokploy.conf.prev";
const SSHD_MAIN_BACKUP_PATH = "/etc/ssh/sshd_config.dokploy.bak";
const SSH_REVERT_DELAY_SECONDS = 60;
const SSH_PENDING_MARKER_PATH = "/run/dokploy-ssh-pending";
const SSH_CONFIRM_ATTEMPTS = 5;

const runRemote = async (serverId: string, script: string) => {
	try {
		const { stdout } = await execAsyncRemote(
			serverId,
			`${SUDO_PREAMBLE}\n${script}`,
		);
		return stdout;
	} catch (error) {
		const reason =
			error instanceof ExecError
				? error.stderr?.trim().split("\n").filter(Boolean).at(-1)
				: undefined;
		throw reason ? new Error(reason) : error;
	}
};

const toBase64 = (content: string) => Buffer.from(content).toString("base64");

const splitSections = (output: string) => {
	const sections: Record<string, string[]> = {};
	let current = "";
	for (const line of output.split("\n")) {
		const marker = line.match(/^<<(\w+)$/);
		if (marker?.[1]) {
			current = marker[1];
			sections[current] = [];
			continue;
		}
		if (current && line.trim()) sections[current]?.push(line);
	}
	return sections;
};

const ipSchema = z.union([z.ipv4(), z.ipv6()]);

const ipOrCidrSchema = z.union([z.ipv4(), z.ipv6(), z.cidrv4(), z.cidrv6()]);

const isIp = (value: string) => ipSchema.safeParse(value).success;
const isIpOrCidr = (value: string) => ipOrCidrSchema.safeParse(value).success;

export const getPanelIps = async () => {
	const ips = IS_CLOUD
		? (process.env.DOKPLOY_CLOUD_IPS?.split(",") ?? [])
		: [(await getWebServerSettings())?.serverIp ?? ""];
	return ips.map((ip) => ip.trim()).filter(isIpOrCidr);
};

export interface Fail2banConfig {
	bantime: number;
	findtime: number;
	maxretry: number;
	ignoreip: string[];
}

export const DEFAULT_FAIL2BAN_CONFIG: Fail2banConfig = {
	bantime: 3600,
	findtime: 600,
	maxretry: 5,
	ignoreip: [],
};

export interface Fail2banJail {
	name: string;
	currentlyFailed: number;
	currentlyBanned: number;
	totalBanned: number;
}

export interface Fail2banBan {
	ip: string;
	jail: string;
	bannedAt: string | null;
	expiresAt: string | null;
	permanent: boolean;
}

const parseBanWithTime = (line: string) => {
	const match = line.match(
		/^(\S+)\s+(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) \+ (-?\d+) = (.+)$/,
	);
	if (!match?.[1]) return null;
	const permanent = match[3] === "-1";
	return {
		ip: match[1],
		bannedAt: match[2] ?? null,
		expiresAt: permanent ? null : (match[4]?.trim() ?? null),
		permanent,
	};
};

const parseFail2banConfig = (lines: string[]): Fail2banConfig | null => {
	if (lines.length === 0) return null;
	const config = { ...DEFAULT_FAIL2BAN_CONFIG };
	let section = "";
	for (const line of lines) {
		const header = line.match(/^\s*\[(.+)\]\s*$/);
		if (header?.[1]) {
			section = header[1];
			continue;
		}
		if (section !== "DEFAULT") continue;
		const [rawKey, ...rawValue] = line.split("=");
		const key = rawKey?.trim();
		const value = rawValue.join("=").trim();
		if (key === "bantime" || key === "findtime" || key === "maxretry") {
			const parsed = Number.parseInt(value, 10);
			if (!Number.isNaN(parsed)) config[key] = parsed;
		}
		if (key === "ignoreip") {
			config.ignoreip = value
				.split(/\s+/)
				.filter((ip) => ip && !["127.0.0.1/8", "::1"].includes(ip));
		}
	}
	return config;
};

export const getFail2banStatus = async (serverId: string) => {
	const output = await runRemote(
		serverId,
		`
installed=false; command -v fail2ban-client >/dev/null 2>&1 && installed=true
active=false; $SUDO systemctl is-active --quiet fail2ban 2>/dev/null && active=true
echo "<<status"
echo "installed=$installed"
echo "active=$active"
echo "<<jails"
if [ "$active" = true ]; then
	jails=$($SUDO fail2ban-client status 2>/dev/null | sed -n 's/.*Jail list:[[:space:]]*//p' | tr -d ' ' | tr ',' ' ')
	for jail in $jails; do
		out=$($SUDO fail2ban-client status "$jail" 2>/dev/null)
		failed=$(echo "$out" | sed -n 's/.*Currently failed:[[:space:]]*//p')
		total=$(echo "$out" | sed -n 's/.*Total banned:[[:space:]]*//p')
		banned=$(echo "$out" | sed -n 's/.*Banned IP list:[[:space:]]*//p')
		echo "$jail|$failed|$total|$banned"
	done
fi
echo "<<bans"
if [ "$active" = true ]; then
	for jail in $jails; do
		$SUDO fail2ban-client get "$jail" banip --with-time 2>/dev/null | while IFS= read -r line; do
			[ -n "$line" ] && echo "$jail|$line"
		done
	done
fi
echo "<<config"
if [ -f ${FAIL2BAN_CONFIG_PATH} ]; then $SUDO cat ${FAIL2BAN_CONFIG_PATH}; fi
`,
	);

	const sections = splitSections(output);
	const status = Object.fromEntries(
		(sections.status ?? []).map((line) => line.split("=")),
	);
	const bans = new Map<string, Fail2banBan>();
	const jails: Fail2banJail[] = (sections.jails ?? []).map((line) => {
		const [name = "", failed, total, banned = ""] = line.split("|");
		const bannedIps = banned.split(/\s+/).filter(Boolean);
		for (const ip of bannedIps) {
			bans.set(`${name}|${ip}`, {
				ip,
				jail: name,
				bannedAt: null,
				expiresAt: null,
				permanent: false,
			});
		}
		return {
			name,
			currentlyFailed: Number.parseInt(failed ?? "0", 10) || 0,
			currentlyBanned: bannedIps.length,
			totalBanned: Number.parseInt(total ?? "0", 10) || 0,
		};
	});
	// --with-time needs fail2ban 0.11+; older versions keep the plain list from the jail status
	for (const line of sections.bans ?? []) {
		const [jail = "", ...rest] = line.split("|");
		const ban = parseBanWithTime(rest.join("|"));
		if (ban) bans.set(`${jail}|${ban.ip}`, { ...ban, jail });
	}
	const config = parseFail2banConfig(sections.config ?? []);

	return {
		installed: status.installed === "true",
		active: status.active === "true",
		managedByDokploy: config !== null,
		config: config ?? DEFAULT_FAIL2BAN_CONFIG,
		jails,
		bans: [...bans.values()],
		panelIps: await getPanelIps(),
	};
};

export const configureFail2ban = async (
	serverId: string,
	config: Fail2banConfig,
) => {
	const ignoreip = [
		"127.0.0.1/8",
		"::1",
		...new Set([...(await getPanelIps()), ...config.ignoreip]),
	].filter(isIpOrCidr);

	const jailConfig = `# Managed by Dokploy
[DEFAULT]
bantime = ${Math.trunc(config.bantime)}
findtime = ${Math.trunc(config.findtime)}
maxretry = ${Math.trunc(config.maxretry)}
ignoreip = ${ignoreip.join(" ")}
banaction = __BANACTION__
banaction_allports = __BANACTION_ALLPORTS__

[sshd]
enabled = true
port = __SSH_PORT__

# Holds IPs banned by hand from Dokploy: never matches logs, bans on every port until unbanned
[${FAIL2BAN_MANUAL_JAIL}]
enabled = true
filter =
backend = polling
logpath = /dev/null
banaction = %(banaction_allports)s
bantime = -1
`;
	// The default 1 day purge would drop permanent bans from the database on the next restart
	const daemonConfig = `# Managed by Dokploy
[Definition]
dbpurgeage = 3650d
`;

	await runRemote(
		serverId,
		`
set -e
if ! command -v fail2ban-client >/dev/null 2>&1; then
	OS_TYPE=$(grep -w "ID" /etc/os-release | cut -d "=" -f 2 | tr -d '"')
	case "$OS_TYPE" in
	ubuntu | debian | raspbian | pop | linuxmint | zorin)
		export DEBIAN_FRONTEND=noninteractive
		$SUDO apt-get update -y >/dev/null
		$SUDO apt-get install -y fail2ban python3-systemd >/dev/null
		;;
	centos | fedora | rhel | ol | rocky | almalinux | amzn)
		$SUDO dnf install -y epel-release >/dev/null 2>&1 || true
		$SUDO dnf install -y fail2ban >/dev/null
		;;
	arch | archarm)
		$SUDO pacman -Sy --noconfirm --needed fail2ban >/dev/null
		;;
	sles | opensuse-leap | opensuse-tumbleweed)
		$SUDO zypper install -y fail2ban >/dev/null
		;;
	*)
		echo "Fail2ban installation is not supported on $OS_TYPE" >&2
		exit 1
		;;
	esac
fi
SSHD=$(command -v sshd || echo /usr/sbin/sshd)
SSH_PORT=$($SUDO "$SSHD" -T 2>/dev/null | awk '/^port /{print $2; exit}')
# Distro defaults can point at a firewall tool that isn't installed (Debian 12 defaults to iptables), which makes bans fail silently
if command -v nft >/dev/null 2>&1; then
	BANACTION="nftables"; BANACTION_ALLPORTS="nftables[type=allports]"
elif command -v iptables >/dev/null 2>&1; then
	BANACTION="iptables-multiport"; BANACTION_ALLPORTS="iptables-allports"
else
	echo "Neither nftables nor iptables is installed, Fail2ban can't block IPs" >&2
	exit 1
fi
$SUDO mkdir -p /etc/fail2ban/jail.d
echo '${toBase64(jailConfig)}' | base64 -d | sed -e "s/__SSH_PORT__/\${SSH_PORT:-22}/" -e "s/__BANACTION_ALLPORTS__/$BANACTION_ALLPORTS/" -e "s/__BANACTION__/$BANACTION/" | $SUDO tee ${FAIL2BAN_CONFIG_PATH} >/dev/null
$SUDO mkdir -p /etc/fail2ban/fail2ban.d
echo '${toBase64(daemonConfig)}' | base64 -d | $SUDO tee ${FAIL2BAN_DAEMON_CONFIG_PATH} >/dev/null
# Distros without auth.log/secure (e.g. Debian 12) only log sshd to the journal
if [ ! -f /var/log/auth.log ] && [ ! -f /var/log/secure ]; then
	printf '[sshd]\\nbackend = systemd\\n' | $SUDO tee /etc/fail2ban/jail.d/dokploy-backend.local >/dev/null
else
	$SUDO rm -f /etc/fail2ban/jail.d/dokploy-backend.local
fi
$SUDO systemctl enable fail2ban >/dev/null 2>&1 || true
$SUDO systemctl restart fail2ban
`,
	);
};

export const setFail2banEnabled = async (
	serverId: string,
	enabled: boolean,
) => {
	await runRemote(
		serverId,
		enabled
			? "$SUDO systemctl enable --now fail2ban"
			: "$SUDO systemctl disable --now fail2ban",
	);
};

export const unbanFail2banIp = async (
	serverId: string,
	jail: string,
	ip: string,
) => {
	if (!/^[\w.-]+$/.test(jail) || !isIp(ip)) {
		throw new Error("Invalid jail or IP address");
	}
	await runRemote(
		serverId,
		`$SUDO fail2ban-client set ${quote([jail])} unbanip ${quote([ip])}`,
	);
};

export const banFail2banIp = async (serverId: string, ip: string) => {
	if (!isIp(ip)) throw new Error("Invalid IP address");
	if ((await getPanelIps()).includes(ip)) {
		throw new Error(
			"This is the IP of the Dokploy panel. Banning it would cut Dokploy off from the server",
		);
	}
	await runRemote(
		serverId,
		`
if ! $SUDO fail2ban-client status ${FAIL2BAN_MANUAL_JAIL} >/dev/null 2>&1; then
	echo "Save the Fail2ban configuration from Dokploy before banning IPs manually" >&2
	exit 1
fi
$SUDO fail2ban-client set ${FAIL2BAN_MANUAL_JAIL} banip ${quote([ip])} >/dev/null
`,
	);
};

export type PortRisk = "critical" | "high" | "medium" | "info";

const KNOWN_PORTS: Record<string, { label: string; risk: PortRisk }> = {
	"tcp/22": { label: "SSH", risk: "info" },
	"tcp/80": { label: "HTTP (Traefik)", risk: "info" },
	"tcp/443": { label: "HTTPS (Traefik)", risk: "info" },
	"udp/443": { label: "HTTP/3 (Traefik)", risk: "info" },
	"tcp/2375": { label: "Docker API (unencrypted)", risk: "critical" },
	"tcp/2376": { label: "Docker API (TLS)", risk: "high" },
	"tcp/2377": { label: "Docker Swarm management", risk: "high" },
	"tcp/7946": { label: "Docker Swarm node communication", risk: "high" },
	"udp/7946": { label: "Docker Swarm node communication", risk: "high" },
	"udp/4789": { label: "Docker Swarm overlay network (VXLAN)", risk: "high" },
	"tcp/8080": { label: "Traefik dashboard", risk: "high" },
	"tcp/5432": { label: "PostgreSQL", risk: "high" },
	"tcp/3306": { label: "MySQL / MariaDB", risk: "high" },
	"tcp/27017": { label: "MongoDB", risk: "high" },
	"tcp/6379": { label: "Redis", risk: "high" },
	"tcp/4500": { label: "Dokploy monitoring", risk: "info" },
};

export interface ExposedPort {
	protocol: string;
	port: number;
	addresses: string[];
	process: string | null;
	dockerName: string | null;
	label: string | null;
	risk: PortRisk;
}

const parseDockerPorts = (lines: string[]) => {
	const map = new Map<string, string>();
	for (const line of lines) {
		const [name, ports = ""] = line.split("\t");
		if (!name) continue;
		for (const match of ports.matchAll(/:(\d+)->\d+\/(tcp|udp)/g)) {
			map.set(`${match[2]}/${match[1]}`, name);
		}
	}
	return map;
};

const isLoopback = (host: string) =>
	host.startsWith("127.") || host === "::1" || host === "localhost";

export const getExposedPorts = async (serverId: string) => {
	const output = await runRemote(
		serverId,
		`
echo "<<ss"
$SUDO ss -H -tulpn 2>/dev/null || true
echo "<<containers"
$SUDO docker ps --format '{{.Names}}\t{{.Ports}}' 2>/dev/null || true
echo "<<services"
$SUDO docker service ls --format '{{.Name}}\t{{.Ports}}' 2>/dev/null || true
echo "<<ufw"
if command -v ufw >/dev/null 2>&1; then
	echo "installed=true"
	$SUDO ufw status verbose 2>/dev/null | grep -q "^Status: active" && echo "active=true" || echo "active=false"
	echo "defaultIncoming=$($SUDO ufw status verbose 2>/dev/null | awk '/^Default:/ { print $2; exit }')"
else
	echo "installed=false"
fi
`,
	);
	const sections = splitSections(output);
	const dockerPorts = new Map([
		...parseDockerPorts(sections.services ?? []),
		...parseDockerPorts(sections.containers ?? []),
	]);

	const ports = new Map<string, ExposedPort>();
	for (const line of sections.ss ?? []) {
		const columns = line.trim().split(/\s+/);
		const protocol = columns[0];
		const local = columns[4];
		if (!protocol || !local || !["tcp", "udp"].includes(protocol)) continue;
		const separator = local.lastIndexOf(":");
		const host = local
			.slice(0, separator)
			.replace(/^\[|\]$/g, "")
			.replace(/%.*$/, "");
		const port = Number.parseInt(local.slice(separator + 1), 10);
		if (Number.isNaN(port) || isLoopback(host)) continue;

		const key = `${protocol}/${port}`;
		const process =
			columns
				.slice(6)
				.join(" ")
				.match(/users:\(\("([^"]+)"/)?.[1] ?? null;
		const existing = ports.get(key);
		if (existing) {
			if (!existing.addresses.includes(host)) existing.addresses.push(host);
			continue;
		}
		const known = KNOWN_PORTS[key];
		ports.set(key, {
			protocol,
			port,
			addresses: [host],
			process,
			dockerName: dockerPorts.get(key) ?? null,
			label: known?.label ?? null,
			risk: known?.risk ?? "medium",
		});
	}

	const riskOrder: Record<PortRisk, number> = {
		critical: 0,
		high: 1,
		medium: 2,
		info: 3,
	};
	const ufw = Object.fromEntries(
		(sections.ufw ?? []).map((line) => line.split("=")),
	);
	return {
		ports: [...ports.values()].sort(
			(a, b) => riskOrder[a.risk] - riskOrder[b.risk] || a.port - b.port,
		),
		ufw: {
			installed: ufw.installed === "true",
			active: ufw.active === "true",
			defaultIncoming: ufw.defaultIncoming || null,
		},
	};
};

export const getPendingUpdates = async (serverId: string) => {
	const output = await runRemote(
		serverId,
		`
APT_OK=true
APT_OUT=""
if command -v apt-get >/dev/null 2>&1; then
	APT_OUT=$(apt list --upgradable 2>/dev/null) || APT_OK=false
fi
echo "<<status"
command -v apt-get >/dev/null 2>&1 && echo "supported=true" || echo "supported=false"
[ -f /var/run/reboot-required ] && echo "rebootRequired=true" || echo "rebootRequired=false"
echo "checkSucceeded=$APT_OK"
echo "listsUpdatedAt=$(find /var/lib/apt/lists -maxdepth 1 -type f -name '*Packages*' -printf '%T@\\n' 2>/dev/null | sort -n | tail -n 1 | cut -d. -f1)"
echo "<<pending"
printf '%s\\n' "$APT_OUT" | grep -- "-security" | cut -d/ -f1 || true
echo "<<reboot"
cat /var/run/reboot-required.pkgs 2>/dev/null | sort -u || true
`,
	);
	const sections = splitSections(output);
	const status = Object.fromEntries(
		(sections.status ?? []).map((line) => line.split("=")),
	);
	return {
		supported: status.supported === "true",
		rebootRequired: status.rebootRequired === "true",
		checkSucceeded: status.checkSucceeded === "true",
		listsUpdatedAt: status.listsUpdatedAt
			? Number(status.listsUpdatedAt) * 1000
			: null,
		pendingSecurityUpdates: sections.pending ?? [],
		rebootRequiredBy: sections.reboot ?? [],
	};
};

export type PermitRootLogin = "yes" | "prohibit-password" | "no";

export interface SshSettings {
	passwordAuthentication: boolean;
	permitRootLogin: PermitRootLogin;
	maxAuthTries: number;
}

export interface AuthorizedKey {
	line: number;
	bits: number;
	fingerprint: string;
	comment: string;
	type: string;
	usedByDokploy: boolean;
}

const toFingerprint = (blob: Buffer) =>
	`SHA256:${createHash("sha256").update(blob).digest("base64").replace(/=+$/, "")}`;

// The stored public key isn't validated against the private key, and SSH authenticates with the private one
export const getDokployKeyFingerprint = (sshKey: {
	privateKey: string;
	publicKey: string;
}) => {
	const parsed = ssh2.utils.parseKey(sshKey.privateKey);
	const key = Array.isArray(parsed) ? parsed[0] : parsed;
	if (key && !(key instanceof Error)) {
		return toFingerprint(key.getPublicSSH());
	}
	const blob = sshKey.publicKey.trim().split(/\s+/)[1];
	return blob ? toFingerprint(Buffer.from(blob, "base64")) : null;
};

const PERMIT_ROOT_LOGIN_VALUES: Record<string, PermitRootLogin> = {
	yes: "yes",
	"prohibit-password": "prohibit-password",
	"without-password": "prohibit-password",
	no: "no",
};

export const getSshSecurity = async (serverId: string) => {
	const server = await findServerById(serverId);
	const output = await runRemote(
		serverId,
		`
SSHD=$(command -v sshd || echo /usr/sbin/sshd)
echo "<<sshd"
$SUDO "$SSHD" -T 2>/dev/null | grep -Ei '^(port|permitrootlogin|passwordauthentication|pubkeyauthentication|maxauthtries) ' || true
echo "<<dropin"
[ -f ${SSHD_DROPIN_PATH} ] && echo "present=true" || echo "present=false"
echo "<<keys"
f="$HOME/.ssh/authorized_keys"
if [ -f "$f" ]; then
	i=0
	while IFS= read -r line || [ -n "$line" ]; do
		i=$((i+1))
		case "$line" in '' | '#'*) continue ;; esac
		fp=$(printf '%s\\n' "$line" | ssh-keygen -lf /dev/stdin 2>/dev/null) || continue
		printf '%s|%s\\n' "$i" "$fp"
	done < "$f"
fi
`,
	);
	const sections = splitSections(output);
	const effective = Object.fromEntries(
		(sections.sshd ?? []).map((line) => {
			const [key = "", ...value] = line.trim().split(/\s+/);
			return [key.toLowerCase(), value.join(" ")];
		}),
	);
	const dokployFingerprint = server.sshKey
		? getDokployKeyFingerprint(server.sshKey)
		: null;

	const authorizedKeys: AuthorizedKey[] = (sections.keys ?? []).flatMap(
		(line) => {
			const [lineNumber, details = ""] = line.split("|");
			const match = details.match(/^(\d+)\s+(\S+)\s+(.*)\s+\(([^)]+)\)$/);
			if (!match) return [];
			const fingerprint = match[2] ?? "";
			return [
				{
					line: Number(lineNumber),
					bits: Number(match[1]),
					fingerprint,
					comment: match[3] === "no comment" ? "" : (match[3] ?? ""),
					type: match[4] ?? "",
					usedByDokploy: fingerprint === dokployFingerprint,
				},
			];
		},
	);

	return {
		username: server.username,
		port: Number(effective.port) || server.port,
		settings: {
			passwordAuthentication: effective.passwordauthentication === "yes",
			permitRootLogin:
				PERMIT_ROOT_LOGIN_VALUES[effective.permitrootlogin ?? ""] ??
				"prohibit-password",
			maxAuthTries: Number(effective.maxauthtries) || 6,
		} satisfies SshSettings,
		pubkeyAuthentication: effective.pubkeyauthentication !== "no",
		managedByDokploy: sections.dropin?.[0] === "present=true",
		authorizedKeys,
	};
};

export const updateSshSettings = async (
	serverId: string,
	settings: SshSettings,
) => {
	const server = await findServerById(serverId);
	if (server.username === "root" && settings.permitRootLogin === "no") {
		throw new Error(
			"Dokploy connects to this server as root. Use 'prohibit-password' instead of disabling root login, or connect with a sudo user first",
		);
	}

	const dropin = `# Managed by Dokploy
PasswordAuthentication ${settings.passwordAuthentication ? "yes" : "no"}
ChallengeResponseAuthentication ${settings.passwordAuthentication ? "yes" : "no"}
PermitRootLogin ${settings.permitRootLogin}
MaxAuthTries ${Math.trunc(settings.maxAuthTries)}
`;
	const token = randomBytes(8).toString("hex");
	const confirmFile = `/tmp/dokploy-ssh-confirm-${token}`;
	const revertScriptPath = `/tmp/dokploy-ssh-revert-${token}.sh`;
	const restore = `
if [ -f ${SSHD_DROPIN_BACKUP_PATH} ]; then mv ${SSHD_DROPIN_BACKUP_PATH} ${SSHD_DROPIN_PATH}; else rm -f ${SSHD_DROPIN_PATH}; fi
if [ -f ${SSHD_MAIN_BACKUP_PATH} ]; then mv ${SSHD_MAIN_BACKUP_PATH} /etc/ssh/sshd_config; fi`;
	const revertScript = `sleep ${SSH_REVERT_DELAY_SECONDS}
if [ -f ${confirmFile} ]; then rm -f ${confirmFile} ${revertScriptPath}; exit 0; fi
if [ "$(cat ${SSH_PENDING_MARKER_PATH} 2>/dev/null)" = "${token}" ]; then
${restore}
systemctl reload ssh 2>/dev/null || systemctl reload sshd
rm -f ${SSH_PENDING_MARKER_PATH}
fi
rm -f ${revertScriptPath}
`;
	const expectedPermitRootLogin =
		settings.permitRootLogin === "prohibit-password"
			? "prohibit-password|without-password"
			: settings.permitRootLogin;

	await runRemote(
		serverId,
		`
set -e
SSHD=$(command -v sshd || echo /usr/sbin/sshd)
# A change still waiting for confirmation shares the backup files, so a second one would break its rollback
if [ -n "$($SUDO find ${SSH_PENDING_MARKER_PATH} -mmin -3 2>/dev/null)" ]; then
	echo "Another SSH change is still waiting for confirmation, try again in a minute" >&2
	exit 1
fi
echo ${token} | $SUDO tee ${SSH_PENDING_MARKER_PATH} >/dev/null
fail() {
	$SUDO sh -c '${restore.trim().replace(/\n/g, "; ")}'
	$SUDO rm -f ${SSH_PENDING_MARKER_PATH}
	echo "$1" >&2
	exit 1
}
$SUDO mkdir -p /etc/ssh/sshd_config.d
$SUDO rm -f ${SSHD_MAIN_BACKUP_PATH}
# sshd keeps the first value it reads, so the drop-in must be included before any other directive
FIRST_DIRECTIVE=$($SUDO grep -vE '^[[:space:]]*(#|$)' /etc/ssh/sshd_config | head -n 1)
if ! printf '%s\\n' "$FIRST_DIRECTIVE" | grep -qE '^[[:space:]]*Include[[:space:]]+/etc/ssh/sshd_config\\.d/\\*\\.conf'; then
	$SUDO cp /etc/ssh/sshd_config ${SSHD_MAIN_BACKUP_PATH}
	$SUDO sed -i '1i Include /etc/ssh/sshd_config.d/*.conf' /etc/ssh/sshd_config
fi
if [ -f ${SSHD_DROPIN_PATH} ]; then $SUDO cp ${SSHD_DROPIN_PATH} ${SSHD_DROPIN_BACKUP_PATH}; else $SUDO rm -f ${SSHD_DROPIN_BACKUP_PATH}; fi
echo '${toBase64(dropin)}' | base64 -d | $SUDO tee ${SSHD_DROPIN_PATH} >/dev/null
$SUDO "$SSHD" -t || fail "Invalid SSH configuration, changes were reverted"
EFFECTIVE=$($SUDO "$SSHD" -T 2>/dev/null)
printf '%s\\n' "$EFFECTIVE" | grep -qx "passwordauthentication ${settings.passwordAuthentication ? "yes" : "no"}" \\
	&& printf '%s\\n' "$EFFECTIVE" | grep -qxE "permitrootlogin (${expectedPermitRootLogin})" \\
	&& printf '%s\\n' "$EFFECTIVE" | grep -qx "maxauthtries ${Math.trunc(settings.maxAuthTries)}" \\
	|| fail "Another SSH configuration file overrides these settings, changes were reverted"
echo '${toBase64(revertScript)}' | base64 -d | $SUDO tee ${revertScriptPath} >/dev/null
$SUDO nohup sh ${revertScriptPath} </dev/null >/dev/null 2>&1 &
kill -0 $! 2>/dev/null || fail "Could not schedule the automatic rollback, changes were reverted"
$SUDO systemctl reload ssh 2>/dev/null || $SUDO systemctl reload sshd
`,
	);

	// A fresh connection proves the new config still lets Dokploy in; without it the server reverts on its own.
	// Retried because sshd can refuse connections for a moment while it reloads.
	for (let attempt = 1; attempt <= SSH_CONFIRM_ATTEMPTS; attempt++) {
		await new Promise((resolve) => setTimeout(resolve, 2000));
		try {
			await runRemote(
				serverId,
				`$SUDO touch ${confirmFile} && $SUDO rm -f ${SSHD_MAIN_BACKUP_PATH} ${SSHD_DROPIN_BACKUP_PATH} ${SSH_PENDING_MARKER_PATH}`,
			);
			return;
		} catch {}
	}
	throw new Error(
		`Dokploy could not reconnect after applying the SSH settings. They will be reverted automatically within ${SSH_REVERT_DELAY_SECONDS} seconds`,
	);
};

export const removeAuthorizedKey = async (
	serverId: string,
	fingerprint: string,
) => {
	if (!/^SHA256:[A-Za-z0-9+/]{43}$/.test(fingerprint)) {
		throw new Error("Invalid key fingerprint");
	}
	const server = await findServerById(serverId);
	if (
		server.sshKey &&
		getDokployKeyFingerprint(server.sshKey) === fingerprint
	) {
		throw new Error(
			"This is the key Dokploy uses to connect to the server and can't be removed",
		);
	}

	await runRemote(
		serverId,
		`
set -e
f="$HOME/.ssh/authorized_keys"
target=${quote([fingerprint])}
# Without the lock, two removals at once both rewrite the original file and one of the keys comes back
if command -v flock >/dev/null 2>&1; then
	exec 9>"$f.dokploy.lock"
	flock -w 30 9 || { echo "Another key removal is in progress, try again" >&2; exit 1; }
fi
tmp=$(mktemp)
removed=0
while IFS= read -r line || [ -n "$line" ]; do
	case "$line" in '' | '#'*) printf '%s\\n' "$line" >> "$tmp"; continue ;; esac
	fp=$(printf '%s\\n' "$line" | ssh-keygen -lf /dev/stdin 2>/dev/null | awk '{print $2}')
	if [ "$fp" = "$target" ]; then removed=$((removed+1)); continue; fi
	printf '%s\\n' "$line" >> "$tmp"
done < "$f"
if [ "$removed" -eq 0 ]; then rm -f "$tmp"; echo "Key not found" >&2; exit 1; fi
cp "$f" "$f.dokploy.bak"
# Writing through the existing file keeps its owner and permissions
cat "$tmp" > "$f"
rm -f "$tmp"
`,
	);
};

export interface FailedLoginSource {
	ip: string;
	attempts: number;
}

export const getServerActivity = async (serverId: string) => {
	const output = await runRemote(
		serverId,
		`
echo "<<sessions"
who 2>/dev/null || true
echo "<<logins"
last -i -w -n 20 2>/dev/null | grep -vE '^(reboot|wtmp|$)' || true
echo "<<failed"
LOGS=""
SOURCE=none
if command -v journalctl >/dev/null 2>&1 && [ -n "$($SUDO journalctl _COMM=sshd _COMM=sshd-session -n 1 -q --no-pager 2>/dev/null)" ]; then
	SOURCE=journal
	LOGS=$($SUDO journalctl _COMM=sshd _COMM=sshd-session --since "24 hours ago" --no-pager -o cat 2>/dev/null || true)
elif [ -f /var/log/auth.log ]; then
	SOURCE=file
	LOGS=$($SUDO tail -n 50000 /var/log/auth.log)
elif [ -f /var/log/secure ]; then
	SOURCE=file
	LOGS=$($SUDO tail -n 50000 /var/log/secure)
fi
COUNTS=$(printf '%s\\n' "$LOGS" | grep -E "Failed password|Invalid user|Connection closed by invalid user|authentication failure" \\
	| grep -oE "from [0-9a-fA-F:.]+" | awk '{print $2}' | sort | uniq -c | sort -rn || true)
printf '%s\\n' "$COUNTS" | head -5000
echo "<<failedSummary"
printf '%s\\n' "$COUNTS" | awk 'NF { total += $1; ips++ } END { print total + 0, ips + 0 }'
echo "<<failedSource"
echo "$SOURCE"
`,
	);
	const sections = splitSections(output);

	const activeSessions = (sections.sessions ?? []).map((line) => {
		const columns = line.trim().split(/\s+/);
		return {
			user: columns[0] ?? "",
			terminal: columns[1] ?? "",
			since: columns
				.slice(2)
				.join(" ")
				.replace(/\s*\(.*\)$/, ""),
			from: line.match(/\(([^)]+)\)/)?.[1] ?? null,
		};
	});

	const recentLogins = (sections.logins ?? []).map((line) => {
		const columns = line.trim().split(/\s+/);
		return {
			user: columns[0] ?? "",
			terminal: columns[1] ?? "",
			from: columns[2] ?? "",
			when: columns.slice(3).join(" "),
		};
	});

	const failedLogins: FailedLoginSource[] = (sections.failed ?? []).flatMap(
		(line) => {
			const [count, ip] = line.trim().split(/\s+/);
			if (!ip || !isIp(ip)) return [];
			return [{ ip, attempts: Number(count) || 0 }];
		},
	);

	const [summaryTotal, summaryIps] = (sections.failedSummary?.[0] ?? "")
		.trim()
		.split(/\s+/);

	return {
		activeSessions,
		recentLogins,
		failedLogins,
		failedLoginsTotal: Number(summaryTotal) || 0,
		failedLoginsUniqueIps: Number(summaryIps) || 0,
		// Log files have no reliable date filter, so they cover the last 50,000 lines instead of 24h
		failedLoginsWindow:
			sections.failedSource?.[0] === "file"
				? ("logFile" as const)
				: ("24h" as const),
		panelIps: await getPanelIps(),
	};
};

export const disconnectSshSession = async (
	serverId: string,
	terminal: string,
	banIp?: string,
) => {
	if (!/^(pts\/\d+|tty\d+)$/.test(terminal)) {
		throw new Error("Invalid terminal");
	}
	// Ban before killing the session so the user can't reconnect in between
	if (banIp) await banFail2banIp(serverId, banIp);
	await runRemote(
		serverId,
		`
if ! $SUDO pkill -KILL -t ${quote([terminal])}; then
	echo "No active session found on ${terminal}" >&2
	exit 1
fi
`,
	);
};

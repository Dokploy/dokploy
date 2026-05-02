import { findServerById } from "@dokploy/server/services/server";
import { Client } from "ssh2";

const buildInstallCommand = () => `
set -e;
OS_TYPE=$(grep -w "ID" /etc/os-release | cut -d "=" -f 2 | tr -d '"')
SYS_ARCH=$(uname -m)
CURRENT_USER=$USER

echo "Installing cloudflared for: OS: $OS_TYPE"

if [ "$EUID" -eq 0 ]; then
	SUDO_CMD=""
	echo "Running as root"
else
	if sudo -n true 2>/dev/null; then
		SUDO_CMD="sudo"
		echo "Running as $CURRENT_USER with sudo privileges"
	else
		echo "Error: Non-root user requires passwordless sudo access. ❌"
		exit 1
	fi
fi

if [ "$OS_TYPE" = "manjaro" ] || [ "$OS_TYPE" = "manjaro-arm" ]; then
	OS_TYPE="arch"
fi

if [ "$OS_TYPE" = "fedora-asahi-remix" ]; then
	OS_TYPE="fedora"
fi

if [ "$OS_TYPE" = "pop" ] || [ "$OS_TYPE" = "linuxmint" ] || [ "$OS_TYPE" = "zorin" ]; then
	OS_TYPE="ubuntu"
fi

CF_ARCH="amd64"
if [ "$SYS_ARCH" = "aarch64" ] || [ "$SYS_ARCH" = "arm64" ]; then
	CF_ARCH="arm64"
elif [ "$SYS_ARCH" = "armv7l" ] || [ "$SYS_ARCH" = "armv6l" ]; then
	CF_ARCH="arm"
fi

install_static_binary() {
	echo "Installing cloudflared static binary ($CF_ARCH)..."
	$SUDO_CMD curl -fsSL "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-$CF_ARCH" -o /usr/local/bin/cloudflared
	$SUDO_CMD chmod +x /usr/local/bin/cloudflared
}

if command -v cloudflared >/dev/null 2>&1; then
	echo "cloudflared already installed ✅"
else
	case "$OS_TYPE" in
		ubuntu | debian | raspbian)
			export DEBIAN_FRONTEND=noninteractive
			$SUDO_CMD mkdir -p --mode=0755 /usr/share/keyrings
			if curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg 2>/dev/null | $SUDO_CMD tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null; then
				CODENAME=$(grep -w "VERSION_CODENAME" /etc/os-release | cut -d "=" -f 2 | tr -d '"')
				if [ -z "$CODENAME" ]; then
					CODENAME="bookworm"
				fi
				echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared $CODENAME main" | $SUDO_CMD tee /etc/apt/sources.list.d/cloudflared.list >/dev/null
				$SUDO_CMD apt-get update -y >/dev/null
				if ! $SUDO_CMD apt-get install -y cloudflared >/dev/null; then
					echo "apt install failed, falling back to static binary"
					install_static_binary
				fi
			else
				echo "Could not fetch CF apt key, falling back to static binary"
				install_static_binary
			fi
			;;
		centos | fedora | rhel | ol | rocky | almalinux | opencloudos | amzn)
			if ! command -v dnf >/dev/null 2>&1; then
				$SUDO_CMD yum install -y dnf >/dev/null 2>&1 || true
			fi
			if command -v dnf >/dev/null 2>&1 && $SUDO_CMD dnf install -y "https://pkg.cloudflare.com/cloudflared-stable-linux-$CF_ARCH.rpm" >/dev/null 2>&1; then
				echo "cloudflared installed via dnf ✅"
			else
				echo "dnf install failed, falling back to static binary"
				install_static_binary
			fi
			;;
		arch | archarm)
			if $SUDO_CMD pacman -Sy --noconfirm cloudflared >/dev/null 2>&1; then
				echo "cloudflared installed via pacman ✅"
			else
				echo "pacman install failed, falling back to static binary"
				install_static_binary
			fi
			;;
		alpine)
			install_static_binary
			;;
		*)
			install_static_binary
			;;
	esac
fi

CLOUDFLARED_BIN=$(command -v cloudflared)
if [ -z "$CLOUDFLARED_BIN" ]; then
	echo "cloudflared installation failed ❌"
	exit 1
fi
echo "cloudflared binary: $CLOUDFLARED_BIN"

UNIT_FILE=/etc/systemd/system/dokploy-tunnel.service
$SUDO_CMD tee "$UNIT_FILE" >/dev/null <<UNIT
[Unit]
Description=Dokploy Cloudflare Tunnel
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=$CLOUDFLARED_BIN tunnel --no-autoupdate run --token \${TUNNEL_TOKEN}
Restart=always
RestartSec=5
User=root

[Install]
WantedBy=multi-user.target
UNIT

$SUDO_CMD systemctl daemon-reload
$SUDO_CMD systemctl enable --now dokploy-tunnel

if ! $SUDO_CMD systemctl is-active --quiet dokploy-tunnel; then
	echo "dokploy-tunnel failed to start ❌"
	$SUDO_CMD systemctl status dokploy-tunnel --no-pager || true
	exit 1
fi

echo "dokploy-tunnel installed and active ✅"
`;

const buildUninstallCommand = () => `
set +e;
CURRENT_USER=$USER

if [ "$EUID" -eq 0 ]; then
	SUDO_CMD=""
else
	if sudo -n true 2>/dev/null; then
		SUDO_CMD="sudo"
	else
		echo "Error: Non-root user requires passwordless sudo access. ❌"
		exit 1
	fi
fi

OS_TYPE=$(grep -w "ID" /etc/os-release | cut -d "=" -f 2 | tr -d '"')

if [ "$OS_TYPE" = "manjaro" ] || [ "$OS_TYPE" = "manjaro-arm" ]; then
	OS_TYPE="arch"
fi
if [ "$OS_TYPE" = "fedora-asahi-remix" ]; then
	OS_TYPE="fedora"
fi
if [ "$OS_TYPE" = "pop" ] || [ "$OS_TYPE" = "linuxmint" ] || [ "$OS_TYPE" = "zorin" ]; then
	OS_TYPE="ubuntu"
fi

$SUDO_CMD systemctl disable --now dokploy-tunnel >/dev/null 2>&1 || true
$SUDO_CMD rm -f /etc/systemd/system/dokploy-tunnel.service
$SUDO_CMD systemctl daemon-reload || true

case "$OS_TYPE" in
	ubuntu | debian | raspbian)
		export DEBIAN_FRONTEND=noninteractive
		$SUDO_CMD apt-get remove -y cloudflared >/dev/null 2>&1 || true
		$SUDO_CMD rm -f /etc/apt/sources.list.d/cloudflared.list
		;;
	centos | fedora | rhel | ol | rocky | almalinux | opencloudos | amzn)
		$SUDO_CMD dnf remove -y cloudflared >/dev/null 2>&1 || true
		;;
	arch | archarm)
		$SUDO_CMD pacman -R --noconfirm cloudflared >/dev/null 2>&1 || true
		;;
esac

$SUDO_CMD rm -f /usr/local/bin/cloudflared

echo "dokploy-tunnel uninstalled ✅"
`;

const handleSshError = (
	err: Error & { level?: string },
	onData?: (data: string) => void,
) => {
	if (err.level === "client-authentication") {
		const technicalDetail = `Error: ${err.message} ${err.level}`;
		const friendlyMessage = [
			"",
			"❌ Couldn't connect to your server — the SSH key was not accepted.",
			"",
			"This usually means the key doesn't match what's on the server, or the key format is invalid.",
			"",
			`Technical details: ${technicalDetail}`,
			"",
			"💡 Hints:",
			"  • Check that the SSH key you added in Dokploy is the same one installed on the server.",
			"  • Make sure the SSH key has been authorized on the target server.",
		].join("\n");
		onData?.(friendlyMessage);
		return new Error(
			`Authentication failed: Invalid SSH private key. ${technicalDetail}`,
		);
	}
	const technicalDetail = `${err.message} ${err.level ?? ""}`.trim();
	const friendlyMessage = [
		"",
		"❌ Couldn't connect to your server.",
		"",
		"The connection failed. Common causes: wrong IP or port, firewall blocking access, or the server is offline.",
		"",
		`Technical details: ${technicalDetail}`,
	].join("\n");
	onData?.(friendlyMessage);
	return new Error(`SSH connection error: ${technicalDetail}`);
};

export const installCloudflaredOnServer = async (
	serverId: string,
	tunnelToken: string,
	onData?: (data: string) => void,
) => {
	const server = await findServerById(serverId);
	if (!server.sshKeyId) {
		onData?.("❌ No SSH Key found, please assign one to this server");
		throw new Error("No SSH Key found");
	}

	// Replace literal token in stdout/stderr before streaming so leaks via
	// systemctl status/cat output don't reach the client.
	const redact = (s: string) => s.split(tunnelToken).join("[REDACTED]");

	const client = new Client();
	const command = `TUNNEL_TOKEN='${tunnelToken.replace(/'/g, "'\\''")}'\n${buildInstallCommand()}`;

	return new Promise<void>((resolve, reject) => {
		client
			.once("ready", () => {
				client.exec(command, (err, stream) => {
					if (err) {
						onData?.(redact(err.message));
						reject(err);
						return;
					}
					stream
						.on("close", (code: number | null) => {
							client.end();
							if (code && code !== 0) {
								reject(
									new Error(
										`cloudflared install failed with exit code ${code}`,
									),
								);
								return;
							}
							resolve();
						})
						.on("data", (data: Buffer) => {
							onData?.(redact(data.toString()));
						})
						.stderr.on("data", (data: Buffer) => {
							onData?.(redact(data.toString()));
						});
				});
			})
			.on("error", (err) => {
				client.end();
				reject(handleSshError(err, onData));
			})
			.connect({
				host: server.ipAddress,
				port: server.port,
				username: server.username,
				privateKey: server.sshKey?.privateKey,
			});
	});
};

export const uninstallCloudflaredOnServer = async (
	serverId: string,
	onData?: (data: string) => void,
) => {
	const server = await findServerById(serverId);
	if (!server.sshKeyId) {
		onData?.("❌ No SSH Key found, please assign one to this server");
		throw new Error("No SSH Key found");
	}

	const client = new Client();
	const command = buildUninstallCommand();

	return new Promise<void>((resolve, reject) => {
		client
			.once("ready", () => {
				client.exec(command, (err, stream) => {
					if (err) {
						onData?.(err.message);
						reject(err);
						return;
					}
					stream
						.on("close", () => {
							client.end();
							resolve();
						})
						.on("data", (data: Buffer) => {
							onData?.(data.toString());
						})
						.stderr.on("data", (data: Buffer) => {
							onData?.(data.toString());
						});
				});
			})
			.on("error", (err) => {
				client.end();
				reject(handleSshError(err, onData));
			})
			.connect({
				host: server.ipAddress,
				port: server.port,
				username: server.username,
				privateKey: server.sshKey?.privateKey,
			});
	});
};

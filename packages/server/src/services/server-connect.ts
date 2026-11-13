import { createHmac, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import { betterAuthSecret } from "../lib/auth-secret";

export const CONNECT_TOKEN_TTL_SECONDS = 60 * 60;

export type ConnectTokenPayload = {
	sshKeyId: string;
	userId: string;
	expiresAt: number;
	serverType: "deploy" | "build";
	enableDockerCleanup: boolean;
};

const ID_PATTERN = /^[A-Za-z0-9_-]+$/;

// Keyed with the SSH key's private key too: betterAuthSecret can still be the
// public legacy default on old installs.
const signingKey = (privateKey: string) =>
	createHmac("sha256", betterAuthSecret)
		.update(`server-connect:${privateKey}`)
		.digest();

// Truncated to 128 bits to keep the command short enough to paste.
const sign = (body: string, privateKey: string) =>
	createHmac("sha256", signingKey(privateKey))
		.update(body)
		.digest()
		.subarray(0, 16)
		.toString("base64url");

const encodePayload = (payload: ConnectTokenPayload) =>
	[
		payload.sshKeyId,
		payload.userId,
		payload.expiresAt.toString(36),
		`${payload.serverType === "build" ? "b" : "d"}${payload.enableDockerCleanup ? 1 : 0}`,
	].join(".");

export const createConnectToken = (
	payload: ConnectTokenPayload,
	privateKey: string,
) => {
	const body = encodePayload(payload);
	return `${body}.${sign(body, privateKey)}`;
};

export const decodeConnectToken = (
	token: string,
): ConnectTokenPayload | null => {
	const parts = token.split(".");
	if (parts.length !== 5) return null;
	const [sshKeyId, userId, expires, flags] = parts as [
		string,
		string,
		string,
		string,
		string,
	];
	if (!ID_PATTERN.test(sshKeyId) || !ID_PATTERN.test(userId)) return null;
	if (!/^[0-9a-z]+$/.test(expires) || !/^[db][01]$/.test(flags)) return null;
	return {
		sshKeyId,
		userId,
		expiresAt: Number.parseInt(expires, 36),
		serverType: flags[0] === "b" ? "build" : "deploy",
		enableDockerCleanup: flags[1] === "1",
	};
};

export const verifyConnectToken = (
	token: string,
	privateKey: string,
	now = Date.now(),
): "valid" | "invalid" | "expired" => {
	const payload = decodeConnectToken(token);
	if (!payload) return "invalid";
	const body = token.slice(0, token.lastIndexOf("."));
	const expected = Buffer.from(sign(body, privateKey));
	const received = Buffer.from(token.slice(token.lastIndexOf(".") + 1));
	if (
		body !== encodePayload(payload) ||
		expected.length !== received.length ||
		!timingSafeEqual(expected, received)
	) {
		return "invalid";
	}
	if (payload.expiresAt * 1000 < now) return "expired";
	return "valid";
};

const REGISTER_URL_PATTERN =
	/^https?:\/\/[A-Za-z0-9.:[\]-]+\/api\/connect\/[A-Za-z0-9_.-]+$/;

export const buildConnectScript = ({
	publicKey,
	registerUrl,
}: {
	publicKey: string;
	registerUrl: string;
}) => {
	const key = publicKey.trim();
	if (!REGISTER_URL_PATTERN.test(registerUrl)) {
		throw new Error("Invalid register URL");
	}
	if (!/^[A-Za-z0-9+/=@. -]+$/.test(key)) {
		throw new Error("Invalid public key");
	}
	return `#!/usr/bin/env bash
set -euo pipefail
main() {
  if [ "$(id -u)" -ne 0 ]; then
    echo "Run this command as root (with sudo)." >&2
    exit 1
  fi
  local keys=/root/.ssh/authorized_keys
  mkdir -p /root/.ssh
  chmod 700 /root/.ssh
  touch "$keys"
  chmod 600 "$keys"
  if [ -s "$keys" ] && [ -n "$(tail -c1 "$keys")" ]; then echo >> "$keys"; fi
  grep -qxF '${key}' "$keys" || echo '${key}' >> "$keys"
  restorecon -R /root/.ssh 2>/dev/null || true
  local body code
  body=$(mktemp)
  # IPv4 first: Dokploy saves the address this request comes from and SSHes to it.
  code=$(curl -4 -sSL --post301 --post302 --post303 -o "$body" -w '%{http_code}' --data '' '${registerUrl}' 2>/dev/null) ||
    code=$(curl -sSL --post301 --post302 --post303 -o "$body" -w '%{http_code}' --data '' '${registerUrl}') ||
    { echo "Could not reach Dokploy." >&2; rm -f "$body"; exit 1; }
  cat "$body"; echo
  rm -f "$body"
  [ "$code" = "200" ] || exit 1
}
main "$@"
`;
};

export const buildConnectErrorScript = (message: string) =>
	`#!/usr/bin/env bash
echo '${message.replace(/'/g, "")}' >&2
exit 1
`;

export const getConnectClientIp = (
	headers: Record<string, string | string[] | undefined>,
	remoteAddress: string | undefined,
) => {
	const header = (name: string) => {
		const value = headers[name];
		return (Array.isArray(value) ? value[0] : value)?.split(",")[0]?.trim();
	};
	// Behind Cloudflare, Traefik puts the Cloudflare edge in X-Forwarded-For.
	// Whoever sends these headers already holds the token, so spoofing only
	// mislabels their own server.
	const ip = (
		header("cf-connecting-ip") ||
		header("x-forwarded-for") ||
		remoteAddress ||
		""
	).replace(/^::ffff:/, "");
	return isIP(ip) ? ip : null;
};

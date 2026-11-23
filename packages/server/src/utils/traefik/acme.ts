import fs from "node:fs";
import path from "node:path";
import { paths } from "@dokploy/server/constants";
import { quote } from "shell-quote";
import { execAsyncRemote } from "../process/execAsync";

type AcmeStore = {
	letsencrypt?: { Certificates?: { domain: { main: string } }[] | null };
};

export const acmeFilePath = (serverId?: string | null) =>
	path.join(paths(!!serverId).DYNAMIC_TRAEFIK_PATH, "acme.json");

export const readAcmeFile = async (serverId?: string | null) => {
	const file = acmeFilePath(serverId);
	if (serverId) {
		const { stdout } = await execAsyncRemote(
			serverId,
			`cat ${quote([file])} 2>/dev/null || true`,
		);
		return stdout;
	}
	return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
};

export const writeAcmeFile = async (
	content: string,
	serverId?: string | null,
	file = acmeFilePath(serverId),
) => {
	// Traefik refuses an acme.json that isn't 0600; rename keeps the swap atomic
	const tmp = `${file}.tmp`;
	if (serverId) {
		await execAsyncRemote(
			serverId,
			`cat > ${quote([tmp])} && chmod 600 ${quote([tmp])} && mv ${quote([tmp])} ${quote([file])}`,
			undefined,
			content,
		);
		return;
	}
	fs.writeFileSync(tmp, content);
	fs.chmodSync(tmp, 0o600);
	fs.renameSync(tmp, file);
};

const parse = (raw: string): AcmeStore | null => {
	if (!raw.trim()) return null;
	try {
		return JSON.parse(raw);
	} catch {
		return null;
	}
};

export const getLetsEncryptHosts = (raw: string) =>
	(parse(raw)?.letsencrypt?.Certificates ?? []).map((cert) =>
		cert.domain.main.toLowerCase(),
	);

export const withoutLetsEncryptHosts = (raw: string, hosts: string[]) => {
	const store = parse(raw);
	const certificates = store?.letsencrypt?.Certificates;
	if (!store?.letsencrypt || !certificates) return null;
	const drop = new Set(hosts);
	const kept = certificates.filter(
		(cert) => !drop.has(cert.domain.main.toLowerCase()),
	);
	if (kept.length === certificates.length) return null;
	store.letsencrypt.Certificates = kept;
	return JSON.stringify(store, null, 2);
};

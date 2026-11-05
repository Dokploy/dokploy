import { X509Certificate } from "node:crypto";
import {
	existsSync,
	readFileSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import path from "node:path";
import { domainToASCII } from "node:url";
import { db } from "@dokploy/server/db";
import { domains } from "@dokploy/server/db/schema";
import { quote } from "shell-quote";
import { paths } from "../constants";
import { whileTraefikStopped } from "../setup/traefik-setup";
import { execAsync, execAsyncRemote } from "../utils/process/execAsync";
import { getWebServerSettings } from "./web-server-settings";

type AcmeStorage = Record<string, unknown>;

export interface AcmeCertificateRef {
	resolver: string;
	main: string;
}

export interface AcmeStoredCertificate extends AcmeCertificateRef {
	sans: string[];
	expiresAt: string | null;
}

export interface TraefikUsedNames {
	hosts: Set<string>;
	patterns: RegExp[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const strings = (values: unknown) =>
	Array.isArray(values)
		? values.filter((value): value is string => typeof value === "string")
		: [];

const normalize = (name: string) => {
	const host = name
		.trim()
		.toLowerCase()
		.replace(/:\d+$/, "")
		.replace(/\.$/, "");
	const wildcard = host.startsWith("*.");
	const bare = wildcard ? host.slice(2) : host;
	const ascii = domainToASCII(bare) || bare;
	return wildcard ? `*.${ascii}` : ascii;
};

const refKey = ({ resolver, main }: AcmeCertificateRef) =>
	`${resolver}\n${normalize(main)}`;

const describeError = (error: unknown) => {
	const stderr = isRecord(error) ? strings([error.stderr])[0]?.trim() : "";
	return stderr || (error instanceof Error ? error.message : String(error));
};

export const parseAcmeStorage = (content: string): AcmeStorage => {
	if (!content.trim()) {
		return {};
	}
	let storage: unknown;
	try {
		storage = JSON.parse(content);
	} catch {
		throw new Error("acme.json is not valid JSON.");
	}
	if (!isRecord(storage)) {
		throw new Error("acme.json has an unexpected format.");
	}
	return storage;
};

const certificatesOf = (data: unknown) =>
	isRecord(data) && Array.isArray(data.Certificates)
		? data.Certificates.filter(isRecord)
		: [];

const domainOf = (certificate: Record<string, unknown>) => {
	const domain = isRecord(certificate.domain) ? certificate.domain : {};
	return {
		main: typeof domain.main === "string" ? domain.main : "",
		sans: strings(domain.sans),
	};
};

const expiryOf = (certificate: unknown) => {
	if (typeof certificate !== "string" || !certificate) {
		return null;
	}
	try {
		const pem = Buffer.from(certificate, "base64").toString();
		return new Date(new X509Certificate(pem).validTo).toISOString();
	} catch {
		return null;
	}
};

export const listAcmeCertificates = (storage: AcmeStorage) => {
	const seen = new Set<string>();
	const certificates: AcmeStoredCertificate[] = [];
	for (const [resolver, data] of Object.entries(storage)) {
		for (const certificate of certificatesOf(data)) {
			const { main, sans } = domainOf(certificate);
			const key = refKey({ resolver, main });
			if (!main.trim() || seen.has(key)) continue;
			seen.add(key);
			certificates.push({
				resolver,
				main,
				sans,
				expiresAt: expiryOf(certificate.certificate),
			});
		}
	}
	return certificates;
};

const unquote = (raw?: string, quoted = "") => {
	if (raw !== undefined) {
		return raw;
	}
	try {
		return JSON.parse(`"${quoted}"`) as string;
	} catch {
		return quoted;
	}
};

const quotedValues = (args: string) =>
	[...args.matchAll(/`([^`]*)`|"((?:[^"\\]|\\.)*)"/g)].map(([, raw, quoted]) =>
		unquote(raw, quoted),
	);

const V2_TEMPLATE = /(\{[a-zA-Z_]\w*(?::[^}]*)?\})/;

const escapeRegExp = (text: string) =>
	text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const fromV2Template = (template: string) =>
	`^${template
		.split(V2_TEMPLATE)
		.map((part, index) => {
			if (index % 2 === 0) return escapeRegExp(part);
			const colon = part.indexOf(":");
			return colon === -1 ? "[^.]+" : `(?:${part.slice(colon + 1, -1)})`;
		})
		.join("")}$`;

const toPattern = (source: string) => {
	const expression = V2_TEMPLATE.test(source)
		? fromV2Template(source)
		: source.replaceAll("(?P<", "(?<");
	try {
		return new RegExp(expression, "i");
	} catch {
		return null;
	}
};

export const addTraefikRouteNames = (
	used: TraefikUsedNames,
	rawdata: unknown,
) => {
	const data = isRecord(rawdata) ? rawdata : {};
	const routers = [data.routers, data.tcpRouters]
		.filter(isRecord)
		.flatMap((group) => Object.values(group).filter(isRecord));

	for (const router of routers) {
		const tls = isRecord(router.tls) ? router.tls : {};
		for (const domain of Array.isArray(tls.domains) ? tls.domains : []) {
			if (!isRecord(domain)) continue;
			for (const name of strings([domain.main, ...strings(domain.sans)])) {
				used.hosts.add(normalize(name));
			}
		}
		const rule = typeof router.rule === "string" ? router.rule : "";
		for (const [, args = ""] of rule.matchAll(
			/\b(?:HostSNI|Host)\(([^)]*)\)/g,
		)) {
			for (const host of quotedValues(args)) {
				if (host.trim() && host !== "*") used.hosts.add(normalize(host));
			}
		}
		for (const [, raw, quoted] of rule.matchAll(
			/\b(?:HostSNIRegexp|HostRegexp)\(\s*(?:`([^`]*)`|"((?:[^"\\]|\\.)*)")/g,
		)) {
			const pattern = toPattern(unquote(raw, quoted));
			if (pattern) used.patterns.push(pattern);
		}
	}
	return used;
};

const nameIsUsed = (name: string, used: TraefikUsedNames) => {
	const certName = normalize(name);
	if (used.hosts.has(certName)) {
		return true;
	}
	const sample = certName.startsWith("*.")
		? `wildcard${certName.slice(1)}`
		: certName;
	if (used.patterns.some((pattern) => pattern.test(sample))) {
		return true;
	}
	if (!certName.startsWith("*.")) {
		return false;
	}
	const suffix = certName.slice(1);
	return [...used.hosts].some(
		(host) =>
			host.endsWith(suffix) &&
			host.length > suffix.length &&
			!host.slice(0, -suffix.length).includes("."),
	);
};

export const findUnusedAcmeCertificates = (
	storage: AcmeStorage,
	used: TraefikUsedNames,
) =>
	listAcmeCertificates(storage)
		.filter(
			(certificate) =>
				![certificate.main, ...certificate.sans].some((name) =>
					nameIsUsed(name, used),
				),
		)
		.sort(
			(a, b) =>
				(a.expiresAt ? Date.parse(a.expiresAt) : Number.POSITIVE_INFINITY) -
				(b.expiresAt ? Date.parse(b.expiresAt) : Number.POSITIVE_INFINITY),
		);

export const withoutAcmeCertificates = (
	storage: AcmeStorage,
	targets: AcmeCertificateRef[],
) => {
	const keys = new Set(targets.map(refKey));
	let removed = 0;
	for (const [resolver, data] of Object.entries(storage)) {
		if (!isRecord(data) || !Array.isArray(data.Certificates)) continue;
		const kept = data.Certificates.filter(
			(certificate) =>
				!isRecord(certificate) ||
				!keys.has(refKey({ resolver, main: domainOf(certificate).main })),
		);
		removed += data.Certificates.length - kept.length;
		data.Certificates = kept;
	}
	return removed;
};

const acmeStoragePath = (serverId?: string) =>
	path.join(paths(!!serverId).DYNAMIC_TRAEFIK_PATH, "acme.json");

const readAcmeFile = async (serverId: string | undefined, file: string) => {
	if (serverId) {
		const { stdout } = await execAsyncRemote(
			serverId,
			`if [ -f ${quote([file])} ]; then cat ${quote([file])}; fi`,
		);
		return stdout;
	}
	return existsSync(file) ? readFileSync(file, "utf8") : "";
};

const readAcmeStorage = async (serverId?: string) => {
	const file = acmeStoragePath(serverId);
	const content = await readAcmeFile(serverId, file).catch((error) => {
		throw new Error(`Couldn't read ${file}: ${describeError(error)}`);
	});
	return parseAcmeStorage(content);
};

const writeAcmeStorage = async (
	serverId: string | undefined,
	storage: AcmeStorage,
) => {
	const file = acmeStoragePath(serverId);
	const temp = `${file}.tmp`;
	const content = `${JSON.stringify(storage, null, 2)}\n`;
	try {
		if (serverId) {
			await execAsyncRemote(
				serverId,
				`umask 077 && cat > ${quote([temp])} && mv ${quote([temp, file])} || { rm -f ${quote([temp])}; exit 1; }`,
				undefined,
				content,
			);
			return;
		}
		rmSync(temp, { force: true });
		writeFileSync(temp, content, { mode: 0o600 });
		renameSync(temp, file);
	} catch (error) {
		if (!serverId) rmSync(temp, { force: true });
		throw new Error(`Couldn't write ${file}: ${describeError(error)}`);
	}
};

const readTraefikRoutes = async (serverId?: string) => {
	const command =
		"docker exec dokploy-traefik wget -q -T 10 -O- http://127.0.0.1:8080/api/rawdata";
	try {
		const { stdout } = serverId
			? await execAsyncRemote(serverId, command)
			: await execAsync(command, { maxBuffer: 64 * 1024 * 1024 });
		const routes: unknown = JSON.parse(stdout);
		return isRecord(routes) ? routes : null;
	} catch {
		return null;
	}
};

const knownDomainNames = async (): Promise<TraefikUsedNames> => {
	const used: TraefikUsedNames = { hosts: new Set(), patterns: [] };
	const rows = await db.select({ host: domains.host }).from(domains);
	for (const { host } of rows) {
		if (host?.trim()) used.hosts.add(normalize(host));
	}
	const panelHost = (await getWebServerSettings())?.host;
	if (panelHost?.trim()) {
		used.hosts.add(normalize(panelHost));
	}
	return used;
};

export const getUnusedTraefikCertificates = async (serverId?: string) => {
	const [storage, used, routes] = await Promise.all([
		readAcmeStorage(serverId),
		knownDomainNames(),
		readTraefikRoutes(serverId),
	]);
	if (routes) {
		addTraefikRouteNames(used, routes);
	}
	return {
		certificates: findUnusedAcmeCertificates(storage, used),
		routesAvailable: routes !== null,
	};
};

export const findRemovableTraefikCertificates = async (
	serverId: string | undefined,
	selected: AcmeCertificateRef[],
) => {
	const { certificates } = await getUnusedTraefikCertificates(serverId);
	const unused = new Set(certificates.map(refKey));
	return selected.filter((certificate) => unused.has(refKey(certificate)));
};

// Traefik overwrites acme.json from memory, so it is edited only while stopped.
export const removeTraefikCertificates = async (
	serverId: string | undefined,
	targets: AcmeCertificateRef[],
) => {
	const routes = await readTraefikRoutes(serverId);
	await whileTraefikStopped(serverId, async () => {
		const storage = await readAcmeStorage(serverId);
		const used = await knownDomainNames();
		if (routes) {
			addTraefikRouteNames(used, routes);
		}
		const unused = new Set(
			findUnusedAcmeCertificates(storage, used).map(refKey),
		);
		const removable = targets.filter((target) => unused.has(refKey(target)));
		if (withoutAcmeCertificates(storage, removable) > 0) {
			await writeAcmeStorage(serverId, storage);
		}
	});
};

import { createHash, X509Certificate } from "node:crypto";
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import path from "node:path";
import { domainToASCII, domainToUnicode } from "node:url";
import { db } from "@dokploy/server/db";
import {
	applications,
	compose,
	domains,
	previewDeployments,
} from "@dokploy/server/db/schema";
import { eq, isNull } from "drizzle-orm";
import { quote } from "shell-quote";
import { paths } from "../constants";
import { queueTraefikTask, restartTraefik } from "../setup/traefik-setup";
import { execAsync, execAsyncRemote } from "../utils/process/execAsync";
import { getWebServerSettings } from "./web-server-settings";

type AcmeStorage = Record<string, unknown>;

export interface AcmeStoredCertificate {
	id: string;
	resolver: string;
	main: string;
	sans: string[];
	expiresAt: string | null;
}

export interface TraefikUsedNames {
	hosts: Set<string>;
	patterns: RegExp[];
	incomplete: boolean;
}

const emptyUsedNames = (): TraefikUsedNames => ({
	hosts: new Set(),
	patterns: [],
	incomplete: false,
});

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

const certificateId = (resolver: string, main: string, sans: string[]) =>
	createHash("sha256")
		.update(
			JSON.stringify([
				resolver,
				normalize(main),
				[...new Set(sans.map(normalize))].sort(),
			]),
		)
		.digest("hex")
		.slice(0, 32);

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
			const id = certificateId(resolver, main, sans);
			if (!main.trim() || seen.has(id)) continue;
			seen.add(id);
			certificates.push({
				id,
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

const POSIX_CLASSES: Record<string, string> = {
	alnum: "a-zA-Z0-9",
	alpha: "a-zA-Z",
	digit: "0-9",
	lower: "a-z",
	upper: "A-Z",
	word: "\\w",
	space: "\\s",
};

const fromGoRegExp = (source: string) =>
	source
		.replace(/\\Q(.*?)(?:\\E|$)/g, (_, literal: string) =>
			escapeRegExp(literal),
		)
		.replaceAll("(?P<", "(?<")
		.replace(/\(\?[imsU-]+\)/g, "")
		.replace(/\(\?[imsU-]+:/g, "(?:")
		.replace(/\\A/g, "^")
		.replace(/\\z/g, "$")
		.replace(
			/\[:(\w+):\]/g,
			(match, name: string) => POSIX_CLASSES[name] ?? match,
		);

const compile = (expression: string, flags: string) => {
	try {
		return new RegExp(expression, flags);
	} catch {
		return null;
	}
};

const toPattern = (source: string) => {
	const expression = V2_TEMPLATE.test(source)
		? fromV2Template(source)
		: fromGoRegExp(source);
	return compile(expression, "i") ?? compile(expression, "iu");
};

const addHostNames = (used: TraefikUsedNames, names: string[]) => {
	for (const name of names) {
		if (name.trim() && name.trim() !== "*") used.hosts.add(normalize(name));
	}
};

export const addTraefikRuleNames = (used: TraefikUsedNames, rule: string) => {
	for (const [, args = ""] of rule.matchAll(
		/\b(?:HostSNI|HostHeader|Host)\(([^)]*)\)/g,
	)) {
		addHostNames(used, quotedValues(args));
	}
	const patternRules = rule.match(/\b(?:HostSNIRegexp|HostRegexp)\(/g) ?? [];
	const patternArgs = [
		...rule.matchAll(
			/\b(?:HostSNIRegexp|HostRegexp)\(\s*(?:`([^`]*)`|"((?:[^"\\]|\\.)*)")/g,
		),
	];
	if (patternArgs.length < patternRules.length) {
		used.incomplete = true;
	}
	for (const [, raw, quoted] of patternArgs) {
		const pattern = toPattern(unquote(raw, quoted));
		if (pattern) {
			used.patterns.push(pattern);
		} else {
			used.incomplete = true;
		}
	}
	return used;
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
			if (isRecord(domain)) {
				addHostNames(used, strings([domain.main, ...strings(domain.sans)]));
			}
		}
		if (typeof router.rule === "string") {
			addTraefikRuleNames(used, router.rule);
		}
	}
	return used;
};

export const addTraefikLabelNames = (
	used: TraefikUsedNames,
	output: string,
) => {
	for (const line of output.split("\n")) {
		if (!line.trim() || line.trim() === "null") continue;
		let labels: unknown;
		try {
			labels = JSON.parse(line);
		} catch {
			used.incomplete = true;
			continue;
		}
		if (!isRecord(labels)) continue;
		for (const [key, value] of Object.entries(labels)) {
			if (typeof value !== "string") continue;
			if (/^traefik\.(?:http|tcp)\.routers\..+\.rule$/.test(key)) {
				addTraefikRuleNames(used, value);
			} else if (
				/^traefik\.(?:http|tcp)\.routers\..+\.tls\.domains\[\d+\]\.(?:main|sans)$/.test(
					key,
				)
			) {
				addHostNames(used, value.split(","));
			}
		}
	}
	return used;
};

const HOSTNAME =
	/(?<![a-z0-9-])(?:\*\.)?(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}(?![a-z0-9-])/g;

export const addConfigTextNames = (used: TraefikUsedNames, text: string) => {
	addHostNames(used, text.toLowerCase().match(HOSTNAME) ?? []);
	return used;
};

const literalText = (pattern: RegExp) =>
	pattern.source.toLowerCase().replace(/\[\.\]|\\\./g, ".");

const patternCouldMatchUnder = (pattern: RegExp, suffix: string) => {
	const parent = suffix.slice(1);
	const text = literalText(pattern);
	return (
		pattern.test(`wildcard${suffix}`) ||
		text.includes(parent) ||
		text.includes(domainToUnicode(parent))
	);
};

const nameIsUsed = (name: string, used: TraefikUsedNames) => {
	const certName = normalize(name);
	if (used.hosts.has(certName)) {
		return true;
	}
	if (!certName.startsWith("*.")) {
		return used.patterns.some((pattern) => pattern.test(certName));
	}
	const suffix = certName.slice(1);
	if (
		used.patterns.some((pattern) => patternCouldMatchUnder(pattern, suffix))
	) {
		return true;
	}
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
	ids: string[],
) => {
	const targets = new Set(ids);
	let removed = 0;
	for (const [resolver, data] of Object.entries(storage)) {
		if (!isRecord(data) || !Array.isArray(data.Certificates)) continue;
		const kept = data.Certificates.filter((certificate) => {
			if (!isRecord(certificate)) return true;
			const { main, sans } = domainOf(certificate);
			return !targets.has(certificateId(resolver, main, sans));
		});
		removed += data.Certificates.length - kept.length;
		data.Certificates = kept;
	}
	return removed;
};

const BACKUPS_KEPT = 5;

const acmeStoragePath = (serverId?: string) =>
	path.join(paths(!!serverId).DYNAMIC_TRAEFIK_PATH, "acme.json");

export const acmeBackupDirectory = (serverId?: string) =>
	path.join(paths(!!serverId).MAIN_TRAEFIK_PATH, "acme-backups");

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

const readAcmeContent = async (serverId?: string) => {
	const file = acmeStoragePath(serverId);
	return readAcmeFile(serverId, file).catch((error) => {
		throw new Error(`Couldn't read ${file}: ${describeError(error)}`);
	});
};

const readAcmeStorage = async (serverId?: string) =>
	parseAcmeStorage(await readAcmeContent(serverId));

const writeAcmeContent = async (
	serverId: string | undefined,
	content: string,
) => {
	const file = acmeStoragePath(serverId);
	const temp = `${file}.tmp`;
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

const pruneLocalBackups = (directory: string) => {
	try {
		const backups = readdirSync(directory)
			.filter((name) => /^acme-.+\.json$/.test(name))
			.sort()
			.reverse();
		for (const name of backups.slice(BACKUPS_KEPT)) {
			rmSync(path.join(directory, name), { force: true });
		}
	} catch {
		return;
	}
};

const backupAcmeContent = async (
	serverId: string | undefined,
	content: string,
) => {
	const directory = acmeBackupDirectory(serverId);
	const file = path.join(
		directory,
		`acme-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
	);
	try {
		if (serverId) {
			await execAsyncRemote(
				serverId,
				`umask 077 && mkdir -p ${quote([directory])} && cat > ${quote([file])} && { ls -1 ${quote([directory])}/acme-*.json | sort -r | tail -n +${BACKUPS_KEPT + 1} | while read -r old; do rm -f -- "$old"; done; true; }`,
				undefined,
				content,
			);
			return file;
		}
		mkdirSync(directory, { recursive: true, mode: 0o700 });
		writeFileSync(file, content, { mode: 0o600 });
	} catch (error) {
		throw new Error(
			`Couldn't back up acme.json to ${directory}, so nothing was removed: ${describeError(error)}`,
		);
	}
	pruneLocalBackups(directory);
	return file;
};

const runOnServer = async (serverId: string | undefined, command: string) => {
	const { stdout } = serverId
		? await execAsyncRemote(serverId, command)
		: await execAsync(command, { maxBuffer: 64 * 1024 * 1024 });
	return stdout;
};

const readTraefikRoutes = async (serverId?: string) => {
	try {
		const routes: unknown = JSON.parse(
			await runOnServer(
				serverId,
				"docker exec dokploy-traefik wget -q -T 10 -O- http://127.0.0.1:8080/api/rawdata",
			),
		);
		return isRecord(routes) ? routes : null;
	} catch {
		return null;
	}
};

const LABELS_COMMAND = [
	"set -e",
	"containers=$(docker ps -aq --filter label=traefik.enable=true)",
	'if [ -n "$containers" ]; then docker inspect --format "{{json .Config.Labels}}" $containers; fi',
	"services=$(docker service ls -q 2>/dev/null || true)",
	'if [ -n "$services" ]; then docker service inspect --format "{{json .Spec.Labels}}" $services; fi',
].join("; ");

const readTraefikLabels = (serverId?: string) =>
	runOnServer(serverId, LABELS_COMMAND).catch(() => null);

const readConfigText = async (serverId?: string) => {
	const directory = paths(!!serverId).DYNAMIC_TRAEFIK_PATH;
	try {
		if (serverId) {
			const quoted = quote([directory]);
			return await runOnServer(
				serverId,
				`for file in ${quoted}/*.yml ${quoted}/*.yaml ${quoted}/*.toml; do [ -e "$file" ] || continue; cat -- "$file" || exit 1; done`,
			);
		}
		if (!existsSync(directory)) {
			return "";
		}
		return readdirSync(directory)
			.filter((name) => /\.(?:ya?ml|toml)$/.test(name))
			.map((name) => readFileSync(path.join(directory, name), "utf8"))
			.join("\n");
	} catch {
		return null;
	}
};

const knownDomainNames = async (serverId?: string) => {
	const used = emptyUsedNames();
	const onServer = (
		column: typeof applications.serverId | typeof compose.serverId,
	) => (serverId ? eq(column, serverId) : isNull(column));
	const groups = await Promise.all([
		db
			.select({ host: domains.host })
			.from(domains)
			.innerJoin(
				applications,
				eq(domains.applicationId, applications.applicationId),
			)
			.where(onServer(applications.serverId)),
		db
			.select({ host: domains.host })
			.from(domains)
			.innerJoin(compose, eq(domains.composeId, compose.composeId))
			.where(onServer(compose.serverId)),
		db
			.select({ host: domains.host })
			.from(domains)
			.innerJoin(
				previewDeployments,
				eq(domains.previewDeploymentId, previewDeployments.previewDeploymentId),
			)
			.innerJoin(
				applications,
				eq(previewDeployments.applicationId, applications.applicationId),
			)
			.where(onServer(applications.serverId)),
	]);
	for (const { host } of groups.flat()) {
		if (host?.trim()) used.hosts.add(normalize(host));
	}
	if (!serverId) {
		const panelHost = (await getWebServerSettings())?.host;
		if (panelHost?.trim()) used.hosts.add(normalize(panelHost));
	}
	return used;
};

const readUsedNames = async (serverId?: string) => {
	const [used, routes, labels, configText] = await Promise.all([
		knownDomainNames(serverId),
		readTraefikRoutes(serverId),
		readTraefikLabels(serverId),
		readConfigText(serverId),
	]);
	if (routes) addTraefikRouteNames(used, routes);
	if (labels !== null) addTraefikLabelNames(used, labels);
	if (configText !== null) addConfigTextNames(used, configText);
	return {
		used,
		routesComplete:
			routes !== null &&
			labels !== null &&
			configText !== null &&
			!used.incomplete,
	};
};

export const getUnusedTraefikCertificates = async (serverId?: string) => {
	const [storage, { used, routesComplete }] = await Promise.all([
		readAcmeStorage(serverId),
		readUsedNames(serverId),
	]);
	return {
		certificates: findUnusedAcmeCertificates(storage, used),
		routesComplete,
	};
};

export const findRemovableTraefikCertificates = async (
	serverId: string | undefined,
	ids: string[],
) => {
	const { certificates, routesComplete } =
		await getUnusedTraefikCertificates(serverId);
	const selected = new Set(ids);
	return {
		targets: certificates.filter((certificate) => selected.has(certificate.id)),
		routesComplete,
	};
};

const messageOf = (error: unknown) =>
	error instanceof Error ? error.message : String(error);

const restartWithUndo = async (
	serverId: string | undefined,
	undo: () => Promise<void>,
) => {
	const restartError = await restartTraefik(serverId).then(
		() => null,
		(error: unknown) => error,
	);
	if (!restartError) {
		return;
	}
	const undoError = await undo().then(
		() => null,
		(error: unknown) => error,
	);
	const retryError = await restartTraefik(serverId, {
		startIfStopped: true,
	}).then(
		() => null,
		(error: unknown) => error,
	);
	const steps = [
		messageOf(restartError),
		undoError
			? `Undoing the change failed: ${messageOf(undoError)}`
			: "The change was undone",
		retryError
			? `Traefik still did not start: ${messageOf(retryError)}`
			: "Traefik is running again",
	];
	throw new Error(`${steps.join(". ")}.`);
};

const removeOnce = async (
	serverId: string | undefined,
	ids: string[],
	used: TraefikUsedNames,
) => {
	const original = await readAcmeContent(serverId);
	const storage = parseAcmeStorage(original);
	const unused = new Set(
		findUnusedAcmeCertificates(storage, used).map(({ id }) => id),
	);
	const targets = ids.filter((id) => unused.has(id));
	if (withoutAcmeCertificates(storage, targets) === 0) {
		return [];
	}
	await backupAcmeContent(serverId, original);
	await writeAcmeContent(serverId, `${JSON.stringify(storage, null, 2)}\n`);
	await restartWithUndo(serverId, () => writeAcmeContent(serverId, original));
	return targets;
};

// Traefik reads acme.json only on start, so edit the file, then restart once.
export const removeTraefikCertificates = (
	serverId: string | undefined,
	ids: string[],
	{
		requireRoutes,
		onStarted,
	}: { requireRoutes: boolean; onStarted?: () => void },
) =>
	queueTraefikTask(serverId, async () => {
		onStarted?.();
		const { used, routesComplete } = await readUsedNames(serverId);
		if (requireRoutes && !routesComplete) {
			throw new Error(
				"Couldn't read Traefik's routes to double-check the selection, so nothing was removed. Try again.",
			);
		}
		let pending = [...new Set(ids)];
		let removed = 0;
		for (let attempt = 1; ; attempt++) {
			const targets = await removeOnce(serverId, pending, used);
			if (targets.length === 0) {
				return removed;
			}
			const left = new Set(
				listAcmeCertificates(await readAcmeStorage(serverId)).map(
					({ id }) => id,
				),
			);
			const savedBack = targets.filter((id) => left.has(id));
			removed += targets.length - savedBack.length;
			if (savedBack.length === 0) {
				return removed;
			}
			if (attempt === 2) {
				throw new Error(
					`Traefik saved ${savedBack.length} of the certificates again while restarting, so they weren't removed. Try again.`,
				);
			}
			pending = savedBack;
		}
	});

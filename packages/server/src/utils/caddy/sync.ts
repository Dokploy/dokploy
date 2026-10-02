import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { IS_CLOUD, paths } from "@dokploy/server/constants";
import { db } from "@dokploy/server/db";
import { certificates, server } from "@dokploy/server/db/schema";
import type { Domain } from "@dokploy/server/services/domain";
import type { Redirect } from "@dokploy/server/services/redirect";
import {
	getWebServerProvider,
	getWebServerSettings,
} from "@dokploy/server/services/web-server-settings";
import { TRPCError } from "@trpc/server";
import * as bcrypt from "bcrypt";
import { eq, isNull } from "drizzle-orm";
import { quote } from "shell-quote";
import { ExecError } from "../process/ExecError";
import {
	execAsync,
	execAsyncRemote,
	writeFileRemote,
} from "../process/execAsync";
import { type CaddyState, renderCaddyfile } from "./caddyfile";

export const CADDY_CONTAINER = "dokploy-caddy";

export const runOn = (serverId: string | null | undefined, command: string) =>
	serverId ? execAsyncRemote(serverId, command) : execAsync(command);

export const writeOn = async (
	serverId: string | null | undefined,
	file: string,
	content: string,
) => {
	if (serverId) await writeFileRemote(serverId, file, content);
	else writeFileSync(file, content);
};

interface WebServerSwitchOutcome {
	target: "traefik" | "caddy";
	status: "running" | "done" | "failed";
	message: string;
}

interface CaddySyncState {
	hashes: Map<string, Promise<string>>;
	switches: Map<string, WebServerSwitchOutcome>;
	tail: Map<string, Promise<unknown>>;
	waiting: Map<string, Promise<void>>;
	forced: Set<string>;
	// The Caddyfile each server's Caddy last accepted, and its answer for as
	// long as it has not accepted the current one.
	applied: Map<string, string>;
	failed: Map<string, string>;
}

// The custom server and Next.js each load their own copy of this module, so
// the state is shared through globalThis, like the deployment queue's.
const globalForCaddy = globalThis as unknown as {
	__dokployCaddySync?: CaddySyncState;
};

globalForCaddy.__dokployCaddySync ??= {
	hashes: new Map(),
	switches: new Map(),
	tail: new Map(),
	waiting: new Map(),
	forced: new Set(),
	applied: new Map(),
	failed: new Map(),
};

const state = globalForCaddy.__dokployCaddySync;

const queueKey = (serverId?: string | null) => serverId ?? "dokploy";

/**
 * How the last provider switch on a server went, for as long as this process
 * remembers it.
 */
export const caddySwitch = (serverId?: string | null) =>
	state.switches.get(queueKey(serverId));

export const recordCaddySwitch = (
	serverId: string | null | undefined,
	outcome: WebServerSwitchOutcome,
) => {
	state.switches.set(queueKey(serverId), outcome);
};

/**
 * Why a server's Caddy is not serving what the database says, when a sync
 * has failed and none has succeeded since.
 */
export const caddySyncError = (serverId?: string | null) =>
	state.failed.get(queueKey(serverId));

/**
 * Runs tasks for one server one at a time. The provider switch goes through
 * here too, so a sync can never interleave with it.
 */
export const withCaddyQueue = <T>(
	serverId: string | null | undefined,
	task: () => Promise<T>,
) => {
	const key = queueKey(serverId);
	const run = (state.tail.get(key) ?? Promise.resolve()).then(task);
	const tail = run
		.catch(() => {})
		.finally(() => {
			if (state.tail.get(key) === tail) state.tail.delete(key);
		});
	state.tail.set(key, tail);
	return run;
};

/**
 * Brings a server's Caddy in line with the database. Every caller gets an
 * apply that starts after its own call, and callers that arrive together
 * share one, except during a provider switch, which is not waited for. Does
 * nothing for a server on Traefik. Rejects with Caddy's own message when it
 * refuses the configuration; Caddy then keeps serving the previous one, and
 * `caddySyncError` reports that until a sync succeeds.
 */
export const syncCaddy = async (serverId?: string | null, force = false) => {
	if ((await getWebServerProvider(serverId)) !== "caddy") return;
	const key = queueKey(serverId);
	if (force) state.forced.add(key);
	let waiting = state.waiting.get(key);
	if (!waiting) {
		waiting = withCaddyQueue(serverId, async () => {
			state.waiting.delete(key);
			const forced = state.forced.delete(key);
			// A switch may have run in the queue since this sync was asked for.
			if ((await getWebServerProvider(serverId)) !== "caddy") return;
			try {
				await applyCaddy(serverId, forced);
			} catch (error) {
				const reason = error instanceof Error ? error.message : String(error);
				state.failed.set(key, reason);
				throw new Error(
					`Caddy did not load the new configuration, so it is not live. ${reason}`,
				);
			}
		});
		state.waiting.set(key, waiting);
	}
	// A switch holds the queue for minutes. The change is saved, and the sync
	// behind the switch applies it.
	if (caddySwitch(serverId)?.status === "running") {
		waiting.catch((error) => console.error("Caddy sync failed:", error));
		return;
	}
	return waiting;
};

/**
 * For deploys, deletions and bulk operations, which must not fail or wait
 * because of the proxy. Never throws and never rejects.
 */
export const syncCaddyInBackground = (serverId?: string | null) =>
	void syncCaddy(serverId).catch((error) =>
		console.error("Caddy sync failed:", error),
	);

/**
 * For boot, and for changes that can reach any server, like deleting a
 * project whose services are spread over several.
 */
export const syncAllCaddyInBackground = () => {
	if (IS_CLOUD) return;
	syncCaddyInBackground();
	void db.query.server
		.findMany({
			where: eq(server.webServerProvider, "caddy"),
			columns: { serverId: true },
		})
		.then((servers) => {
			for (const { serverId } of servers) syncCaddyInBackground(serverId);
		})
		.catch((error) => console.error("Caddy sync failed:", error));
};

const routerLabelKeys = (labels: string) =>
	`{{range $k, $v := ${labels}}}{{if eq (printf "%.21s" $k) "traefik.http.routers."}} {{$k}}{{end}}{{end}}`;

/**
 * One command that reports which running containers and Swarm services carry
 * Traefik router labels, and which uploaded certificate folders exist. It
 * prints names and label keys only, so the output stays small.
 */
const caddyLookupCommand = (certificatesPath: string) => `set -e
containers=$(docker ps -q)
# A container can stop between the two commands. The others are still reported.
[ -z "$containers" ] || docker inspect -f '{{.Name}}${routerLabelKeys(".Config.Labels")}' $containers 2>/dev/null || true
if [ "$(docker info -f '{{.Swarm.ControlAvailable}}')" = true ]; then
	services=$(docker service ls -q)
	[ -z "$services" ] || docker service inspect -f '{{.Spec.Name}}${routerLabelKeys(".Spec.Labels")}' $services 2>/dev/null || true
fi
for folder in ${quote([certificatesPath])}/*; do
	[ ! -d "$folder" ] || echo "certificate:$folder"
done`;

export const parseCaddyLookup = (output: string) => {
	const targets = new Map<string, string[]>();
	const folders = new Set<string>();
	for (const line of output.split("\n")) {
		if (line.startsWith("certificate:")) {
			folders.add(line.slice("certificate:".length));
			continue;
		}
		const [name = "", ...labels] = line.trim().split(/\s+/);
		for (const label of labels) {
			targets.set(label, [
				...(targets.get(label) ?? []),
				name.replace(/^\//, ""),
			]);
		}
	}
	return { targets, folders };
};

const lookupCaddy = async (serverId?: string | null) => {
	const { stdout } = await runOn(
		serverId,
		caddyLookupCommand(paths(!!serverId).CERTIFICATES_PATH),
	);
	return parseCaddyLookup(stdout);
};

// Every domain with what its route needs from its owner. Reading them all and
// filtering in memory is fine into the tens of thousands of rows.
const findRouteDomains = () =>
	db.query.domains.findMany({
		with: {
			application: {
				columns: { appName: true, serverId: true },
				with: { security: true, redirects: true },
			},
			compose: { columns: { appName: true, serverId: true } },
			previewDeployment: {
				columns: { appName: true, applicationId: true },
				with: {
					application: {
						columns: { appName: true, serverId: true },
						with: { security: true },
					},
				},
			},
		},
	});

type RouteDomain = Awaited<ReturnType<typeof findRouteDomains>>[number];

const routeUsers = (domain: RouteDomain) =>
	(domain.application ?? domain.previewDeployment?.application)?.security ?? [];

const isOnServer = (domain: RouteDomain, serverId?: string | null) => {
	const owner =
		domain.application ??
		domain.compose ??
		domain.previewDeployment?.application;
	return !!owner && (owner.serverId || null) === (serverId || null);
};

/**
 * Every domain served from one server, enabled or not, with its owner.
 */
export const findServerDomains = async (serverId?: string | null) =>
	(await findRouteDomains()).filter((domain) => isOnServer(domain, serverId));

const hashKey = (user: { securityId: string; password: string }) =>
	JSON.stringify([user.securityId, user.password]);

// bcrypt salts every hash, which would change the rendered text on each
// render and defeat both the unchanged check and Caddy's own no-op reload.
const hashPassword = (user: Parameters<typeof hashKey>[0]) => {
	const key = hashKey(user);
	let hash = state.hashes.get(key);
	if (!hash) {
		hash = bcrypt.hash(user.password, 10);
		state.hashes.set(key, hash);
	}
	return hash;
};

/**
 * Reads what one server's Caddy should serve: the routes Traefik's writers
 * produce for the same rows, in a stable order.
 */
export const loadCaddyState = async (
	serverId?: string | null,
): Promise<CaddyState> => {
	const all = await findRouteDomains();
	const live = new Set(all.flatMap(routeUsers).map(hashKey));
	for (const key of state.hashes.keys()) {
		if (!live.has(key)) state.hashes.delete(key);
	}
	// Traefik serves a custom entrypoint on another port, so leaving those
	// domains out changes nothing on 80 and 443.
	const domains = all.filter(
		(domain) =>
			domain.enabled &&
			!domain.customEntrypoint &&
			isOnServer(domain, serverId),
	);
	const uploaded = await db.query.certificates.findMany({
		where: serverId
			? eq(certificates.serverId, serverId)
			: isNull(certificates.serverId),
		columns: { certificatePath: true, certificateData: true, privateKey: true },
	});
	const settings = await getWebServerSettings();
	const { CERTIFICATES_PATH } = paths(!!serverId);
	const { targets, folders } =
		domains.some((domain) => domain.compose) || uploaded.length
			? await lookupCaddy(serverId)
			: parseCaddyLookup("");

	const routes: CaddyState["routes"] = [];
	for (const domain of domains) {
		const { path, internalPath, uniqueConfigKey } = domain;
		// A compose domain is served by whatever carries the router label
		// Dokploy injected at deploy. On nothing yet, it has no route, and
		// after its service changes it stays where it is until the next
		// deploy, both as with Traefik.
		const names = domain.compose
			? (targets.get(
					`traefik.http.routers.${domain.compose.appName}-${uniqueConfigKey}-web.rule`,
				) ?? [])
			: [domain.previewDeployment?.appName ?? domain.application?.appName];
		if (!names.length) continue;
		const users = await Promise.all(
			routeUsers(domain).map(async (user) => ({
				username: user.username,
				hash: await hashPassword(user),
			})),
		);
		routes.push({
			host: domain.host,
			https: domain.https,
			selfSigned: domain.certificateType === "none",
			path,
			uniqueConfigKey,
			stripPrefix: domain.stripPath && path && path !== "/" ? path : null,
			// Applications and compose services decide this differently, see
			// createRouterConfig and createDomainLabels.
			addPrefix:
				internalPath &&
				internalPath !== "/" &&
				(domain.compose ? internalPath.startsWith("/") : internalPath !== path)
					? internalPath
					: null,
			unsupported:
				caddyUnsupported({
					forwardAuthEnabled: domain.forwardAuthEnabled,
					middlewares: domain.middlewares,
				}) ?? undefined,
			upstreams: [...new Set(names)]
				.sort()
				.map((name) => `${name}:${domain.port || 80}`),
			users: users.sort((a, b) => a.username.localeCompare(b.username)),
			redirects: [...(domain.application?.redirects ?? [])].sort(
				(a, b) => a.uniqueConfigKey - b.uniqueConfigKey,
			),
		});
	}
	if (!serverId) {
		routes.push({
			// Until a host is assigned, Traefik's default configuration serves
			// the dashboard at this address, over HTTP only.
			host: settings?.host || "dokploy.docker.localhost",
			https: !!settings?.host && settings.https,
			selfSigned: settings?.certificateType === "none",
			uniqueConfigKey: 0,
			path: null,
			stripPrefix: null,
			addPrefix: null,
			upstreams: [`dokploy:${process.env.PORT || 3000}`],
			users: [],
			redirects: [],
		});
	}
	return {
		email: settings?.letsEncryptEmail,
		routes: routes.sort((a, b) => a.uniqueConfigKey - b.uniqueConfigKey),
		// Without its files a certificate would make Caddy reject every later
		// change, so its host falls back to automatic HTTPS.
		certificates: uploaded
			.map((certificate) => ({
				folder: join(CERTIFICATES_PATH, certificate.certificatePath),
				...certificate,
			}))
			.filter(({ folder }) => folders.has(folder))
			.sort((a, b) => a.folder.localeCompare(b.folder))
			.map(({ folder, certificateData, privateKey }) => ({
				certFile: join(folder, "chain.crt"),
				keyFile: join(folder, "privkey.key"),
				certificateData,
				privateKey,
			})),
	};
};

// Caddy prints log lines around its verdict. The admin should see the verdict,
// not the command.
export const caddyError = (error: unknown) => {
	if (!(error instanceof ExecError)) {
		return error instanceof Error ? error : new Error(String(error));
	}
	const output = [error.stderr, error.stdout].filter(Boolean).join("\n").trim();
	return new Error(
		output.split("\n").find((line) => line.startsWith("Error:")) ||
			output ||
			error.message,
	);
};

/**
 * Renders a server's Caddyfile and has Caddy load it. Caddy validates before
 * it swaps and keeps serving the previous configuration when it refuses the
 * new one, so nothing here needs undoing.
 */
export const applyCaddy = async (
	serverId?: string | null,
	force = false,
): Promise<void> => {
	const { caddyfile } = renderCaddyfile(await loadCaddyState(serverId));
	const key = queueKey(serverId);
	if (!force && state.applied.get(key) === caddyfile) return;
	const file = join(paths(!!serverId).MAIN_CADDY_PATH, "Caddyfile");
	// timeout runs inside the container, where it always exists.
	const reload = `docker exec ${CADDY_CONTAINER} timeout 60 caddy reload --config /etc/caddy/Caddyfile${force ? " --force" : ""}`;
	try {
		await writeOn(serverId, file, caddyfile);
		await runOn(serverId, reload);
		state.applied.set(key, caddyfile);
		state.failed.delete(key);
	} catch (error) {
		state.applied.delete(key);
		throw caddyError(error);
	}
};

/**
 * What a domain uses that only Traefik can provide, as a sentence.
 */
export const caddyUnsupported = (
	domain: Partial<
		Pick<
			Domain,
			| "forwardAuthEnabled"
			| "middlewares"
			| "customEntrypoint"
			| "certificateType"
		>
	>,
) => {
	const feature =
		(domain.forwardAuthEnabled && "Forward auth") ||
		(domain.middlewares?.length && "A custom middleware") ||
		(domain.customEntrypoint && "A custom entrypoint") ||
		(domain.certificateType === "custom" && "A custom certificate resolver");
	return feature ? `${feature} is not available with Caddy` : null;
};

/**
 * Refuses a domain setting Caddy cannot honour on a server that runs Caddy,
 * instead of saving it and serving the domain without it.
 */
export const assertCaddySupports = async (
	serverId: string | null | undefined,
	domain: Parameters<typeof caddyUnsupported>[0],
) => {
	const reason = caddyUnsupported(domain);
	if (reason && (await getWebServerProvider(serverId)) === "caddy") {
		throw new TRPCError({ code: "BAD_REQUEST", message: reason });
	}
};

/**
 * Has the running Caddy compile a redirect before it is saved. One pattern Go
 * cannot compile would otherwise make Caddy reject every later change on the
 * server. Does nothing for a server on Traefik.
 */
export const assertCaddyAcceptsRedirect = async (
	serverId: string | null | undefined,
	redirect: Pick<Redirect, "regex" | "replacement" | "permanent">,
): Promise<void> => {
	if ((await getWebServerProvider(serverId)) !== "caddy") return;
	const { caddyfile, refused } = renderCaddyfile({
		certificates: [],
		routes: [
			{
				host: "redirect.localhost",
				https: false,
				uniqueConfigKey: 0,
				path: null,
				stripPrefix: null,
				addPrefix: null,
				upstreams: ["dokploy:3000"],
				users: [],
				redirects: [{ ...redirect, uniqueConfigKey: 0 }],
			},
		],
	});
	const refuse = (message: string) =>
		new TRPCError({ code: "BAD_REQUEST", message });
	if (refused.length) {
		throw refuse("The redirect contains characters Caddy cannot use");
	}
	const command = `echo ${Buffer.from(caddyfile).toString("base64")} | base64 -d | docker exec -i ${CADDY_CONTAINER} caddy validate --adapter caddyfile --config -`;
	try {
		await runOn(serverId, command);
	} catch (error) {
		const failure = caddyError(error);
		const reason = /error parsing regexp: (.+?): `/.exec(failure.message)?.[1];
		throw reason ? refuse(`The regex is not valid: ${reason}`) : failure;
	}
};

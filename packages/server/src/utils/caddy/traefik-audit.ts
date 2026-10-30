import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { paths } from "@dokploy/server/constants";
import { db } from "@dokploy/server/db";
import type { Security } from "@dokploy/server/services/security";
import { getWebServerSettings } from "@dokploy/server/services/web-server-settings";
import {
	getDefaultMiddlewares,
	getDefaultServerTraefikConfig,
	getDefaultTraefikConfig,
} from "@dokploy/server/setup/traefik-setup";
import * as bcrypt from "bcrypt";
import { quote } from "shell-quote";
import { parse } from "yaml";
import { createDomainLabels } from "../docker/domain";
import { execAsyncRemote } from "../process/execAsync";
import { createServiceConfig } from "../traefik/application";
import { createRouterConfig } from "../traefik/domain";
import type { FileConfig, HttpRouter } from "../traefik/file-types";
import { authDomainConfigName } from "../traefik/forward-auth";
import { type findServerDomains, runOn } from "./sync";

type ServerId = string | null | undefined;
type ServerDomain = Awaited<ReturnType<typeof findServerDomains>>[number];

// traefik.yml and the entries of the dynamic folder, by their name inside
// Traefik's folder. Configuration files and acme.json come with their content.
export const readTraefikFiles = async (serverId: ServerId) => {
	const root = paths(!!serverId).MAIN_TRAEFIK_PATH;
	if (serverId) {
		const { stdout } = await execAsyncRemote(
			serverId,
			`cd ${quote([root])} || exit 0
for file in traefik.yml dynamic/*; do
	case "$file" in
		*.yml | *.yaml | dynamic/acme.json) [ -f "$file" ] && printf '%s\\t%s\\n' "$file" "$(base64 < "$file" | tr -d '\\n')" ;;
		*) [ -e "$file" ] && echo "$file" ;;
	esac
done
true`,
		);
		return new Map(
			stdout
				.split("\n")
				.filter(Boolean)
				.map((line): [string, string] => {
					const [name = "", content = ""] = line.split("\t");
					return [name, Buffer.from(content, "base64").toString()];
				}),
		);
	}
	const dynamic = join(root, "dynamic");
	const names = existsSync(dynamic) ? readdirSync(dynamic) : [];
	return new Map(
		["traefik.yml", ...names.map((name) => `dynamic/${name}`)].map(
			(name): [string, string] => {
				try {
					return /\.ya?ml$|^dynamic\/acme\.json$/.test(name)
						? [name, readFileSync(join(root, name), "utf8")]
						: [name, ""];
				} catch {
					return [name, ""];
				}
			},
		),
	);
};

// The labels of every running container and Swarm service, by its name.
export const readTraefikLabels = async (serverId: ServerId) => {
	const { stdout } = await runOn(
		serverId,
		`containers=$(docker ps -q)
[ -z "$containers" ] || docker inspect -f '{{.Name}} {{json .Config.Labels}}' $containers 2>/dev/null || true
if [ "$(docker info -f '{{.Swarm.ControlAvailable}}')" = true ]; then
	services=$(docker service ls -q)
	[ -z "$services" ] || docker service inspect -f '{{.Spec.Name}} {{json .Spec.Labels}}' $services 2>/dev/null || true
fi`,
	);
	return new Map(
		stdout
			.split("\n")
			.filter(Boolean)
			.map((line): [string, Record<string, string>] => {
				const space = line.indexOf(" ");
				return [
					line.slice(0, space).replace(/^\//, ""),
					(JSON.parse(line.slice(space + 1)) as Record<string, string>) ?? {},
				];
			}),
	);
};

// Dokploy's writers leave undefined values and the order of keys to the YAML
// library.
const same = (a: unknown, b: unknown) =>
	isDeepStrictEqual(
		JSON.parse(JSON.stringify(a ?? null)),
		JSON.parse(JSON.stringify(b ?? null)),
	);

// bcrypt salts every hash, so a user is compared by the password it accepts.
const sameUsers = async (
	definition: unknown,
	rows: Pick<Security, "username" | "password">[],
) => {
	const users = (definition as { basicAuth?: { users?: unknown } } | null)
		?.basicAuth?.users;
	if (
		!Array.isArray(users) ||
		users.length !== rows.length ||
		Object.keys(definition as object).length !== 1
	) {
		return false;
	}
	const accepted = await Promise.all(
		rows.map(async ({ username, password }) => {
			const hash = users
				.map(String)
				.find((user) => user.startsWith(`${username}:`))
				?.slice(username.length + 1);
			return !!hash && bcrypt.compare(password, hash).catch(() => false);
		}),
	);
	return accepted.every(Boolean);
};

/**
 * Lists what Traefik does on a server that does not come from the database,
 * and that Caddy will therefore not do: a hand-added IP allow-list must not
 * silently stop applying. Traefik's files and labels are compared with what
 * Dokploy's own writers produce for the same rows, so a change made by hand
 * under a name Dokploy uses is found too.
 */
export const findHandWrittenTraefikConfig = async (
	serverId: ServerId,
	domains: ServerDomain[],
	files: Map<string, string>,
	labels: Map<string, Record<string, string>>,
) => {
	const applications = (
		await db.query.applications.findMany({
			columns: { appName: true, serverId: true },
			with: { previewDeployments: { columns: { appName: true } } },
		})
	).filter(
		(application) => (application.serverId || null) === (serverId || null),
	);
	const ownFiles = new Set([
		"traefik.yml",
		"dynamic/acme.json",
		"dynamic/access.log",
		"dynamic/certificates",
		...[
			"dokploy",
			"middlewares",
			authDomainConfigName,
			...applications.flatMap((application) => [
				application.appName,
				...application.previewDeployments.map((preview) => preview.appName),
			]),
		].map((name) => `dynamic/${name}.yml`),
	]);

	// Each router with every middleware it may carry, each service, each
	// middleware and each label, as the database has them.
	const routers = new Map<string, HttpRouter>();
	const services = new Map<string, unknown>();
	const middlewares = new Map<string, unknown>(
		Object.entries(
			(parse(getDefaultMiddlewares()) as FileConfig).http?.middlewares ?? {},
		),
	);
	const users = new Map<string, Security[]>();
	const ownLabels = new Set<string>();
	for (const domain of domains) {
		if (!domain.enabled) continue;
		const key = domain.uniqueConfigKey;
		const entrypoints = domain.customEntrypoint
			? [domain.customEntrypoint]
			: ["web", ...(domain.https ? ["websecure"] : [])];
		if (domain.compose) {
			for (const entrypoint of entrypoints) {
				for (const label of createDomainLabels(
					domain.compose.appName,
					domain,
					entrypoint,
				)) {
					ownLabels.add(label);
				}
			}
			continue;
		}
		const owner = domain.application ?? domain.previewDeployment?.application;
		const appName =
			domain.previewDeployment?.appName ?? domain.application?.appName;
		if (!owner || !appName) continue;
		const redirects = domain.application?.redirects ?? [];
		if (owner.security.length) {
			users.set(`auth-${owner.appName}`, owner.security);
		}
		for (const redirect of redirects) {
			const { regex, replacement, permanent } = redirect;
			middlewares.set(`redirect-${appName}-${redirect.uniqueConfigKey}`, {
				redirectRegex: { regex, replacement, permanent },
			});
		}
		// addMiddleware puts an application's own middlewares on every router in
		// its file, the one that only redirects to HTTPS included.
		const shared = domain.application
			? [
					...(owner.security.length ? [`auth-${appName}`] : []),
					...redirects.map(
						(redirect) => `redirect-${appName}-${redirect.uniqueConfigKey}`,
					),
				]
			: [];
		for (const entrypoint of entrypoints) {
			const router = await createRouterConfig(
				{ appName, redirects, security: owner.security },
				domain,
				entrypoint,
			);
			const used = router.middlewares ?? [];
			routers.set(
				`${appName}-router-${entrypoint === "websecure" ? "websecure-" : ""}${key}`,
				{ ...router, middlewares: [...used, ...shared] },
			);
			if (used.includes(`stripprefix-${appName}-${key}`)) {
				middlewares.set(`stripprefix-${appName}-${key}`, {
					stripPrefix: { prefixes: [domain.path] },
				});
			}
			if (used.includes(`addprefix-${appName}-${key}`)) {
				middlewares.set(`addprefix-${appName}-${key}`, {
					addPrefix: { prefix: domain.internalPath },
				});
			}
		}
		services.set(
			`${appName}-service-${key}`,
			createServiceConfig(appName, domain),
		);
	}
	if (!serverId) {
		// As updateServerTraefik and createDefaultServerTraefikConfig write them.
		const settings = await getWebServerSettings();
		const dashboard = {
			rule: settings?.host
				? `Host(\`${settings.host}\`)`
				: "Host(`dokploy.docker.localhost`) && PathPrefix(`/`)",
			service: "dokploy-service-app",
		};
		routers.set("dokploy-router-app", {
			...dashboard,
			entryPoints: ["web"],
			middlewares: ["redirect-to-https"],
		});
		routers.set("dokploy-router-app-secure", {
			...dashboard,
			entryPoints: ["websecure"],
			...(settings?.certificateType === "letsencrypt" && {
				tls: { certResolver: "letsencrypt" },
			}),
		});
		services.set(dashboard.service, {
			loadBalancer: {
				servers: [{ url: `http://dokploy:${process.env.PORT || 3000}` }],
				passHostHeader: true,
			},
		});
	}

	const found: string[] = [];
	for (const [name, content] of files) {
		if (!ownFiles.has(name)) {
			found.push(`${name} was not written by Dokploy. Caddy will not read it.`);
			continue;
		}
		if (name === "traefik.yml" || !name.endsWith(".yml")) continue;
		let config: FileConfig;
		try {
			config = (parse(content) ?? {}) as FileConfig;
		} catch {
			found.push(`${name} is not plain YAML. Caddy will not apply it.`);
			continue;
		}
		for (const [router, { middlewares: used, ...written }] of Object.entries(
			config.http?.routers ?? {},
		)) {
			const { middlewares: allowed, ...expected } = routers.get(router) ?? {};
			if (!same(written, expected)) {
				found.push(
					`${name}: the router ${router} is not the one Dokploy writes for a domain. Caddy follows the database, not this file.`,
				);
				continue;
			}
			for (const middleware of used ?? []) {
				if (!allowed?.includes(middleware.replace(/@file$/, ""))) {
					found.push(
						`${name}: the router ${router} uses the middleware ${middleware}, which Caddy will not apply.`,
					);
				}
			}
		}
		for (const [service, written] of Object.entries(
			config.http?.services ?? {},
		)) {
			if (!same(written, services.get(service))) {
				found.push(
					`${name}: the service ${service} is not the one Dokploy writes for a domain. Caddy follows the database, not this file.`,
				);
			}
		}
		// A definition under any other name matters only where a router uses
		// it, which is reported above.
		for (const [middleware, written] of Object.entries(
			config.http?.middlewares ?? {},
		)) {
			const rows = users.get(middleware);
			if (
				rows
					? !(await sameUsers(written, rows))
					: middlewares.has(middleware) &&
						!same(written, middlewares.get(middleware))
			) {
				found.push(
					`${name}: the middleware ${middleware} is not the one Dokploy writes. Caddy follows the database, not this file.`,
				);
			}
		}
		for (const section of ["tcp", "udp", "tls"] as const) {
			if (config[section]) {
				found.push(
					`${name} has a ${section} section. Caddy will not apply it.`,
				);
			}
		}
	}

	for (const [name, entries] of labels) {
		// Traefik reads label names without regard to case.
		const traefik = Object.entries(entries).filter(([label]) =>
			/^traefik\./i.test(label),
		);
		// Dokploy's traefik.yml has Traefik ignore a container without this.
		if (
			!traefik.some(
				([label, value]) =>
					/^traefik\.enable$/i.test(label) && /^(1|t|true)$/i.test(value),
			)
		) {
			continue;
		}
		const foreign = traefik
			.filter(
				([label, value]) =>
					!ownLabels.has(`${label}=${value}`) &&
					!/^traefik\.(enable|docker\.network|swarm\.network)$/i.test(label),
			)
			.map(([label]) => label);
		if (foreign.length) {
			found.push(
				`${name} has Traefik labels that do not come from a domain in Dokploy: ${foreign.slice(0, 3).join(", ")}${foreign.length > 3 ? ` and ${foreign.length - 3} more` : ""}. Caddy will not apply them.`,
			);
		}
	}

	// The ACME email and the access log are what Dokploy itself changes in
	// that file.
	const comparable = (yaml: string) =>
		JSON.parse(
			JSON.stringify(parse(yaml) ?? {}, (key, value: unknown) =>
				key === "email" || key === "accessLog" ? undefined : value,
			),
		) as unknown;
	const traefikYml = files.get("traefik.yml") ?? "";
	if ((parse(traefikYml) as { accessLog?: unknown } | null)?.accessLog) {
		found.push(
			"The Requests page reads Traefik's access log. It shows nothing new while Caddy serves.",
		);
	}
	const defaults = serverId
		? getDefaultServerTraefikConfig()
		: getDefaultTraefikConfig();
	if (!isDeepStrictEqual(comparable(traefikYml), comparable(defaults))) {
		found.push(
			"traefik.yml differs from the one Dokploy writes today. Caddy does not read that file.",
		);
	}
	return found;
};

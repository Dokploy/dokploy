import { X509Certificate } from "node:crypto";
import { quote } from "shell-quote";
import { paths } from "../constants";
import { findApplicationById } from "../services/application";
import {
	getDockerResourceType,
	readPorts,
	reconnectServicesToTraefik,
} from "../services/settings";
import {
	setWebServerProvider,
	type WebServerProvider,
} from "../services/web-server-settings";
import { CADDY_IMAGE, renderCaddyfile } from "../utils/caddy/caddyfile";
import {
	certificateBundle,
	SWITCH_MARKER,
	switchToCaddyScript,
	switchToTraefikScript,
} from "../utils/caddy/cutover";
import {
	applyCaddy,
	CADDY_CONTAINER,
	caddyError,
	caddySwitch,
	caddyUnsupported,
	findServerDomains,
	loadCaddyState,
	recordCaddySwitch,
	runOn,
	withCaddyQueue,
	writeOn,
} from "../utils/caddy/sync";
import {
	findHandWrittenTraefikConfig,
	readTraefikFiles,
	readTraefikLabels,
} from "../utils/caddy/traefik-audit";
import { ExecError, sleep } from "../utils/process/execAsync";
import { manageDomain } from "../utils/traefik/domain";
import {
	initializeStandaloneTraefik,
	TRAEFIK_HTTP3_PORT,
	TRAEFIK_PORT,
	TRAEFIK_SSL_PORT,
} from "./traefik-setup";

const TRAEFIK_CONTAINER = "dokploy-traefik";

interface WebServerSwitchCheck {
	// The Caddyfile the switch would start Caddy with. Empty when the target
	// is Traefik.
	caddyfile: string;
	// The switch is refused while there is one.
	blockers: string[];
	// What Traefik does today that will stop: each has to be accepted.
	acknowledge: string[];
	warnings: string[];
}

type ServerId = string | null | undefined;

// What a failed command printed is Caddy's or Docker's own account of the
// failure. A switch script prints the container's last log lines before its
// own verdict: of those, only Caddy's error is worth showing.
const failureMessage = (error: unknown) => {
	const lines =
		error instanceof ExecError ? (error.stderr?.trim().split("\n") ?? []) : [];
	const [last] = lines.slice(-1);
	if (!last) return error instanceof Error ? error.message : String(error);
	const verdict = lines.find((line) => line.startsWith("Error:"));
	return verdict && verdict !== last ? `${verdict}\n${last}` : last;
};

const cutoverOptions = (serverId: ServerId) => ({
	image: CADDY_IMAGE,
	caddy: CADDY_CONTAINER,
	traefik: TRAEFIK_CONTAINER,
	network: "dokploy-network",
	publish: [
		`${TRAEFIK_PORT}:80`,
		`${TRAEFIK_SSL_PORT}:443`,
		`${TRAEFIK_HTTP3_PORT}:443/udp`,
	],
	caddyPath: paths(!!serverId).MAIN_CADDY_PATH,
	certificatesPath: paths(!!serverId).CERTIFICATES_PATH,
});

// Traefik's certificate store, or an empty one when it is missing or damaged:
// the worst that follows is that Caddy requests certificates again.
const readAcme = (files: Map<string, string>) => {
	try {
		const text = files.get("dynamic/acme.json") || "{}";
		const certificates = Object.values(
			JSON.parse(text) as Record<
				string,
				{ Certificates?: { certificate: string }[] } | null
			>,
		).flatMap((resolver) => resolver?.Certificates ?? []);
		return { text, certificates };
	} catch {
		return { text: "{}", certificates: [] };
	}
};

/**
 * The dry run of a provider switch. It changes nothing: the candidate
 * Caddyfile is written next to the live one, under another name.
 */
export const checkWebServerSwitch = async (
	target: WebServerProvider,
	serverId?: string | null,
): Promise<WebServerSwitchCheck> => {
	const files = await readTraefikFiles(serverId);
	if (target === "traefik") {
		const soon = Date.now() + 30 * 24 * 60 * 60 * 1000;
		const expiring = readAcme(files).certificates.filter(({ certificate }) => {
			try {
				const pem = Buffer.from(certificate, "base64");
				return new Date(new X509Certificate(pem).validTo).getTime() < soon;
			} catch {
				return true;
			}
		}).length;
		return {
			caddyfile: "",
			blockers: [],
			acknowledge: [],
			warnings: [
				...(expiring
					? [
							`${expiring} of the certificates Traefik holds have expired or expire within 30 days. Traefik requests those again when it starts.`,
						]
					: []),
				"A compose domain that changed while Caddy served takes effect under Traefik at that compose's next deploy.",
			],
		};
	}

	const { MAIN_CADDY_PATH, CERTIFICATES_PATH } = paths(!!serverId);
	const state = await loadCaddyState(serverId);
	const { caddyfile, refused, automatic } = renderCaddyfile(state);
	const all = await findServerDomains(serverId);
	const domains = all.filter((domain) => domain.enabled);
	const blockers = [
		...domains.flatMap((domain) => {
			const reason = caddyUnsupported(domain);
			return reason ? [`${domain.host}: ${reason}.`] : [];
		}),
		...refused.map(
			(route) =>
				`${route.host}${route.path ?? ""}: its host, a path, a redirect or a user name cannot be written in a Caddyfile.`,
		),
	];

	// Validating compiles every redirect pattern and reads the admin's own
	// files and the uploaded certificates, as Caddy will when it starts.
	await runOn(serverId, `mkdir -p ${quote([MAIN_CADDY_PATH])}`);
	const candidate = `${MAIN_CADDY_PATH}/Caddyfile.check`;
	await writeOn(serverId, candidate, caddyfile);
	try {
		await runOn(
			serverId,
			`docker run --rm --network none -v ${quote([`${MAIN_CADDY_PATH}:/etc/caddy`])} -v ${quote([`${CERTIFICATES_PATH}:${CERTIFICATES_PATH}:ro`])} ${CADDY_IMAGE} caddy validate --adapter caddyfile --config /etc/caddy/Caddyfile.check
status=$?
rm -f ${quote([candidate])}
exit $status`,
		);
	} catch (error) {
		blockers.push(
			`Caddy rejects the configuration. ${caddyError(error).message}`,
		);
	}

	const traefik = await getDockerResourceType(
		TRAEFIK_CONTAINER,
		serverId ?? undefined,
	);
	if (traefik !== "standalone") {
		blockers.push(
			traefik === "service"
				? "Traefik runs as a Swarm service on this server. Run the server setup again to convert it to a container, then switch."
				: "The Traefik container was not found on this server.",
		);
	}

	const labels = await readTraefikLabels(serverId);
	const acknowledge = await findHandWrittenTraefikConfig(
		serverId,
		all,
		files,
		labels,
	);
	// readPorts throws for a container that is not there, which is reported
	// as a blocker above.
	const ports =
		traefik === "standalone"
			? await readPorts(TRAEFIK_CONTAINER, serverId ?? undefined)
			: [];
	const extraPorts = ports
		.map((port) => `${port.publishedPort}/${port.protocol}`)
		.filter(
			(port) =>
				![
					`${TRAEFIK_PORT}/tcp`,
					`${TRAEFIK_SSL_PORT}/tcp`,
					`${TRAEFIK_HTTP3_PORT}/udp`,
				].includes(port),
		);
	if (extraPorts.length) {
		acknowledge.push(
			`Traefik also publishes ${extraPorts.join(", ")}. Caddy will not.`,
		);
	}

	const warnings: string[] = [];
	const carried = new Set(
		certificateBundle(readAcme(files).text)
			.split("\n")
			.map((line) => line.split(" ")[0]?.split("/").pop()),
	);
	const waiting = automatic.filter((host) => !carried.has(host));
	if (waiting.length) {
		warnings.push(
			`Traefik holds no certificate Caddy can take over for ${waiting.join(", ")}. Caddy asks Let's Encrypt for one when it starts, and until it has one these hosts do not answer over HTTPS, where Traefik answers with a self-signed certificate. For a domain Let's Encrypt cannot validate, set the certificate provider to None, which keeps that behaviour.`,
		);
	}
	const unanchored = new Set(
		state.routes.flatMap((route) =>
			route.redirects
				.map((redirect) => redirect.regex)
				.filter((regex) => !regex.startsWith("^")),
		),
	);
	for (const regex of unanchored) {
		warnings.push(
			`The redirect ${regex} does not start with ^. If it matches a URL more than once, Traefik replaces every match and Caddy only the first.`,
		);
	}
	const upstreams = [
		...new Set(state.routes.flatMap((route) => route.upstreams)),
	];
	if (upstreams.length) {
		// Inside Traefik's network namespace, so it sees every network the proxy
		// is attached to. Nothing is probed while Traefik is not running.
		const probe = upstreams
			.map((upstream) => {
				const [host = "", port = ""] = upstream.split(":");
				return `nc -z -w 2 ${quote([host, port])} || echo ${quote([upstream])}`;
			})
			.join("; ");
		const { stdout: silent } = await runOn(
			serverId,
			`docker run --rm --network container:${TRAEFIK_CONTAINER} ${CADDY_IMAGE} sh -c ${quote([probe])} 2>/dev/null; true`,
		);
		for (const upstream of silent.split("\n").filter(Boolean)) {
			warnings.push(
				`${upstream} does not answer. Its application may be stopped.`,
			);
		}
	}
	const labelled = new Set(
		[...labels.values()].flatMap((entries) => Object.keys(entries)),
	);
	for (const domain of domains) {
		if (
			domain.compose &&
			!domain.customEntrypoint &&
			!labelled.has(
				`traefik.http.routers.${domain.compose.appName}-${domain.uniqueConfigKey}-web.rule`,
			)
		) {
			warnings.push(
				`${domain.host} has no running container, so it gets its route at that compose's next deploy.`,
			);
		}
	}
	return { caddyfile, blockers, acknowledge, warnings };
};

// Which proxy serves, according to Docker. By its status, because Docker also
// calls a container running while it keeps restarting it. Caddy only with the
// restart policy the switch gives it before starting it: without that policy
// it was not started by a switch.
const servingProvider = async (
	serverId: ServerId,
): Promise<WebServerProvider | undefined> => {
	const marker = `${paths(!!serverId).MAIN_CADDY_PATH}/${SWITCH_MARKER}`;
	// A dropped connection does not stop the script on the server, so its
	// marker is waited for, as long as a slow image pull can take.
	for (let attempt = 0; attempt < 60; attempt++) {
		try {
			const { stdout } = await runOn(
				serverId,
				`[ -e ${quote([marker])} ] && echo ${SWITCH_MARKER}
docker inspect -f '{{.Name}} {{.State.Status}} {{.HostConfig.RestartPolicy.Name}}' ${CADDY_CONTAINER} ${TRAEFIK_CONTAINER} 2>/dev/null
docker info >/dev/null`,
			);
			// A marker that outlives the wait was left by a script that was
			// killed, and Docker's answer stands.
			if (!stdout.includes(SWITCH_MARKER) || attempt === 59) {
				if (stdout.includes(`/${CADDY_CONTAINER} running always`)) {
					return "caddy";
				}
				return stdout.includes(`/${TRAEFIK_CONTAINER} running`)
					? "traefik"
					: undefined;
			}
		} catch {}
		await sleep(5000);
	}
};

const switchToCaddy = async (serverId: ServerId) => {
	const { MAIN_CADDY_PATH } = paths(!!serverId);
	const { caddyfile } = renderCaddyfile(await loadCaddyState(serverId));
	const bundle = certificateBundle(
		readAcme(await readTraefikFiles(serverId)).text,
	);
	// The bundle holds private keys. The script unpacks and deletes it.
	const prepare = `umask 077 && mkdir -p ${quote([`${MAIN_CADDY_PATH}/data`])} && : > ${quote([`${MAIN_CADDY_PATH}/data/certificates.import`])}`;
	await runOn(serverId, prepare);
	await writeOn(
		serverId,
		`${MAIN_CADDY_PATH}/data/certificates.import`,
		bundle,
	);
	await writeOn(serverId, `${MAIN_CADDY_PATH}/Caddyfile`, caddyfile);
	// Before the script, so that every state other than the intended one is
	// loud: a sync against a Caddy that is not running fails with an error. The
	// other order could leave Caddy serving while the column says Traefik.
	await setWebServerProvider("caddy", serverId);
	await runOn(serverId, switchToCaddyScript(cutoverOptions(serverId)));
};

// The column stays on Caddy until Docker confirms Traefik: if this is cut
// short, a later change then fails with an error instead of being skipped
// for a Caddy that still serves.
const switchToTraefik = async (serverId: ServerId) => {
	const { stdout } = await runOn(
		serverId,
		switchToTraefikScript(cutoverOptions(serverId)),
	);
	const recreated = stdout.split("\n").includes("missing");
	if (recreated) {
		await initializeStandaloneTraefik({ serverId: serverId ?? undefined });
	}
	await reconnectServicesToTraefik(serverId ?? undefined);
	return recreated;
};

// Traefik's files were written all along, but its writers swallow errors, so
// every application and preview domain is written once more.
const rewriteTraefikFiles = async (serverId: ServerId) => {
	for (const domain of await findServerDomains(serverId)) {
		const applicationId =
			domain.applicationId ?? domain.previewDeployment?.applicationId;
		if (!applicationId) continue;
		try {
			const application = await findApplicationById(applicationId);
			if (domain.previewDeployment) {
				application.appName = domain.previewDeployment.appName;
			}
			await manageDomain(application, domain);
		} catch (error) {
			console.error(`Traefik config for ${domain.host}:`, error);
		}
	}
};

/**
 * Refuses while the dry run has blockers or unaccepted items, then switches
 * in the background: on the Dokploy host the dashboard is reached through the
 * proxy being replaced, so the request cannot wait for the outcome. It is
 * recorded for `caddySwitch` to return.
 */
export const switchWebServer = async (
	target: WebServerProvider,
	serverId: string | null | undefined,
	acknowledged: boolean,
) => {
	if (caddySwitch(serverId)?.status === "running") {
		throw new Error("A switch is already running on this server.");
	}
	// Before the first await, so that a second request is refused above.
	recordCaddySwitch(serverId, { target, status: "running", message: "" });
	try {
		const check = await checkWebServerSwitch(target, serverId);
		if (check.blockers.length) throw new Error(check.blockers.join("\n"));
		if (check.acknowledge.length && !acknowledged) {
			throw new Error(
				"Some of Traefik's configuration will stop applying. Accept that before switching.",
			);
		}
	} catch (error) {
		recordCaddySwitch(serverId, {
			target,
			status: "failed",
			message: failureMessage(error),
		});
		throw error;
	}

	// In the queue, so that no sync and no second switch can interleave.
	void withCaddyQueue(serverId, async () => {
		let failure = "";
		let recreated = false;
		try {
			if (target === "caddy") await switchToCaddy(serverId);
			else recreated = await switchToTraefik(serverId);
		} catch (error) {
			failure = failureMessage(error);
		}
		// Whatever the script reported, the column follows what Docker says.
		let serving = await servingProvider(serverId);
		if (target === "traefik" && serving !== "traefik") {
			// As the script's own restore does: a Traefik that is not serving must
			// not come back with the Docker daemon either.
			await runOn(
				serverId,
				`docker stop ${TRAEFIK_CONTAINER} >/dev/null 2>&1
docker update --restart no ${TRAEFIK_CONTAINER} >/dev/null 2>&1
docker update --restart always ${CADDY_CONTAINER} && docker start ${CADDY_CONTAINER}`,
			).catch(() => {});
			serving = await servingProvider(serverId);
		}
		// With neither confirmed the column stays on Caddy, the value that makes
		// every later change fail with an error instead of going stale quietly.
		await setWebServerProvider(serving ?? "caddy", serverId);
		if (serving === "caddy") await applyCaddy(serverId, true);
		else if (serving === "traefik") await rewriteTraefikFiles(serverId);

		const names = { caddy: "Caddy", traefik: "Traefik" };
		if (serving !== target) {
			throw new Error(
				[
					failure,
					serving
						? `${names[serving]} is serving`
						: "Docker did not confirm that either proxy is serving. Check the server.",
				]
					.filter(Boolean)
					.join("\n"),
			);
		}
		return recreated
			? "Traefik is serving. Its container had been removed, so it was created again with the default ports and environment."
			: `${names[serving]} is serving`;
	}).then(
		(message) =>
			recordCaddySwitch(serverId, { target, status: "done", message }),
		(error) =>
			recordCaddySwitch(serverId, {
				target,
				status: "failed",
				message: failureMessage(error),
			}),
	);
};

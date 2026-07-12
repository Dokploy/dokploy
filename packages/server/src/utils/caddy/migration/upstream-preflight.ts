import {
	execAsync,
	execAsyncRemote,
} from "@dokploy/server/utils/process/execAsync";
import { quote } from "shell-quote";
import { parseCaddyUpstream, readCaddyRouteFragments } from "../config";
import type { CaddyRouteFragment } from "../types";
import { DOKPLOY_CADDY_NETWORK } from "../upstream-targets";
import { listMigrationFiles, readRequiredMigrationTextFile } from "./files";
import type {
	CaddyMigrationReport,
	CaddyMigrationRuntimePreflight,
	CaddyMigrationRuntimePreflightCheck,
	CaddyMigrationRuntimePreflightRoute,
} from "./types";

const PROBE_IMAGE = "busybox:1.36";
const DEFAULT_PROBE_NETWORK = DOKPLOY_CADDY_NETWORK;
type ProbeMode = "standalone" | "service";

const runCommand = async (command: string, serverId?: string) => {
	if (serverId) {
		return execAsyncRemote(serverId, command);
	}
	return execAsync(command);
};

const splitDial = (dial: string) => {
	const separatorIndex = dial.lastIndexOf(":");
	if (separatorIndex === -1) {
		throw new Error("normalized upstream dial is missing a port");
	}
	const host = dial.slice(0, separatorIndex);
	const port = Number(dial.slice(separatorIndex + 1));
	if (!host || !Number.isInteger(port)) {
		throw new Error("normalized upstream dial is invalid");
	}
	return { host, port };
};

const routeRefsFromFragment = (
	fragment: CaddyRouteFragment,
): {
	refs: CaddyMigrationRuntimePreflightRoute[];
	invalidChecks: CaddyMigrationRuntimePreflightCheck[];
} => {
	const refs: CaddyMigrationRuntimePreflightRoute[] = [];
	const invalidChecks: CaddyMigrationRuntimePreflightCheck[] = [];
	for (const route of fragment.routes) {
		if (route.redirectScheme) continue;
		for (const upstream of route.upstreams) {
			let host = "";
			let port = 0;
			try {
				const parsed = parseCaddyUpstream(upstream);
				const normalized = splitDial(parsed.dial);
				host = normalized.host;
				port = normalized.port;
			} catch (error) {
				invalidChecks.push({
					dial: upstream,
					host: "",
					port: 0,
					status: "failed",
					reason:
						error instanceof Error ? error.message : "Invalid upstream format",
					routes: [
						{
							routeId: route.id,
							routeHosts: route.hosts,
							source: route.source,
							sourceFragment: fragment.id,
							upstream,
							normalizedHost: "",
							normalizedPort: 0,
							network: route.upstreamNetwork ?? DEFAULT_PROBE_NETWORK,
						},
					],
					network: route.upstreamNetwork ?? DEFAULT_PROBE_NETWORK,
				});
				continue;
			}
			refs.push({
				routeId: route.id,
				routeHosts: route.hosts,
				source: route.source,
				sourceFragment: fragment.id,
				upstream,
				normalizedHost: host,
				normalizedPort: port,
				network: route.upstreamNetwork ?? DEFAULT_PROBE_NETWORK,
			});
		}
	}
	return { refs, invalidChecks };
};

const readPreflightInputs = async (
	report: CaddyMigrationReport,
	serverId?: string,
) => {
	const refs: CaddyMigrationRuntimePreflightRoute[] = [];
	const invalidChecks: CaddyMigrationRuntimePreflightCheck[] = [];
	const fragmentFiles = await listMigrationFiles(
		report.artifactPaths.fragmentsDir,
		serverId,
		[".json"],
	);
	for (const fragmentFile of fragmentFiles) {
		const content = await readRequiredMigrationTextFile(fragmentFile, serverId);
		const fragment = JSON.parse(content) as CaddyRouteFragment;
		const parsed = routeRefsFromFragment(fragment);
		refs.push(...parsed.refs);
		invalidChecks.push(...parsed.invalidChecks);
	}
	return { refs, invalidChecks };
};

const collectPreflightInputs = (fragments: CaddyRouteFragment[]) => {
	const refs: CaddyMigrationRuntimePreflightRoute[] = [];
	const invalidChecks: CaddyMigrationRuntimePreflightCheck[] = [];
	for (const fragment of fragments) {
		const parsed = routeRefsFromFragment(fragment);
		refs.push(...parsed.refs);
		invalidChecks.push(...parsed.invalidChecks);
	}
	return { refs, invalidChecks };
};

const probeScript = [
	'if nc -z -w 3 "$1" "$2" >/dev/null 2>&1; then echo passed; exit 0; fi',
	'if ! nslookup "$1" >/dev/null 2>&1; then echo dns_failed; exit 10; fi',
	"echo tcp_failed",
	"exit 11",
].join("; ");

const parseProbeFailure = (error: unknown, output: string) => {
	if (output.includes("dns_failed")) {
		return "DNS resolution failed";
	}
	if (output.includes("tcp_failed")) {
		return "TCP connection failed";
	}
	if (output) {
		return output.split("\n").slice(-3).join("; ");
	}
	return error instanceof Error ? error.message : "upstream probe failed";
};

const shouldFallbackToServiceProbe = (reason: string) =>
	[
		/not manually attachable/i,
		/not attachable/i,
		/network .* not found/i,
		/could not find network/i,
		/only supported for user defined networks/i,
		/error response from daemon/i,
	].some((pattern) => pattern.test(reason));

const probeStandaloneUpstream = async (
	host: string,
	port: number,
	network: string,
	serverId?: string,
) => {
	const command = [
		"docker run --rm",
		`--network ${quote([network])}`,
		quote([PROBE_IMAGE]),
		"sh -c",
		quote([probeScript]),
		"sh",
		quote([host]),
		quote([String(port)]),
	].join(" ");

	try {
		const { stdout } = await runCommand(command, serverId);
		return stdout.trim() === "passed"
			? null
			: stdout.trim() || "upstream probe did not report success";
	} catch (error) {
		const output =
			`${(error as { stdout?: string }).stdout ?? ""}\n${(error as { stderr?: string }).stderr ?? ""}`.trim();
		return parseProbeFailure(error, output);
	}
};

const probeServiceUpstream = async (
	host: string,
	port: number,
	network: string,
	serverId?: string,
) => {
	const serviceName = `dokploy-caddy-preflight-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
	const command = `
set -e
SERVICE_NAME=${quote([serviceName])}
docker service rm "$SERVICE_NAME" >/dev/null 2>&1 || true
trap 'docker service rm "$SERVICE_NAME" >/dev/null 2>&1 || true' EXIT
docker service create --detach=true --name "$SERVICE_NAME" --restart-condition none --network ${quote([network])} ${quote([PROBE_IMAGE])} sh -c ${quote([probeScript])} sh ${quote([host])} ${quote([String(port)])} >/dev/null
for i in $(seq 1 30); do
	LOGS=$(docker service logs --raw "$SERVICE_NAME" 2>&1 || true)
	if echo "$LOGS" | grep -Eq '(^|[[:space:]])(passed|dns_failed|tcp_failed)([[:space:]]|$)'; then
		echo "$LOGS"
		exit 0
	fi
	STATE=$(docker service ps "$SERVICE_NAME" --no-trunc --format '{{.CurrentState}} {{.Error}}' 2>&1 | head -n 1 || true)
	if echo "$STATE" | grep -Eq 'Failed|Rejected|Complete|Shutdown'; then
		echo "$LOGS"
		echo "$STATE"
		exit 0
	fi
	sleep 1
done
docker service logs --raw "$SERVICE_NAME" 2>&1 || true
exit 12
`;

	try {
		const { stdout } = await runCommand(command, serverId);
		return stdout.trim().includes("passed")
			? null
			: parseProbeFailure(new Error("upstream service probe failed"), stdout);
	} catch (error) {
		const output =
			`${(error as { stdout?: string }).stdout ?? ""}\n${(error as { stderr?: string }).stderr ?? ""}`.trim();
		return parseProbeFailure(error, output);
	}
};

const probeUpstream = async (
	host: string,
	port: number,
	network: string,
	serverId?: string,
): Promise<{ failureReason: string | null; probeMode: ProbeMode }> => {
	const standaloneFailure = await probeStandaloneUpstream(
		host,
		port,
		network,
		serverId,
	);
	if (!standaloneFailure) {
		return { failureReason: null, probeMode: "standalone" };
	}
	if (!shouldFallbackToServiceProbe(standaloneFailure)) {
		return { failureReason: standaloneFailure, probeMode: "standalone" };
	}

	const serviceFailure = await probeServiceUpstream(
		host,
		port,
		network,
		serverId,
	);
	if (!serviceFailure) {
		return { failureReason: null, probeMode: "service" };
	}
	return {
		failureReason: `standalone probe failed (${standaloneFailure}); service probe failed (${serviceFailure})`,
		probeMode: "service",
	};
};

const failedFragmentReadPreflight = (
	error: unknown,
): CaddyMigrationRuntimePreflight => ({
	status: "failed",
	checkedAt: new Date().toISOString(),
	network: DEFAULT_PROBE_NETWORK,
	networks: [DEFAULT_PROBE_NETWORK],
	probeImage: PROBE_IMAGE,
	checks: [
		{
			dial: "fragment-read",
			host: "",
			port: 0,
			network: DEFAULT_PROBE_NETWORK,
			status: "failed",
			reason:
				error instanceof Error
					? error.message
					: "Unable to read Caddy fragments",
			routes: [],
		},
	],
});

const runUpstreamPreflight = async (
	refs: CaddyMigrationRuntimePreflightRoute[],
	invalidChecks: CaddyMigrationRuntimePreflightCheck[],
	serverId?: string,
): Promise<CaddyMigrationRuntimePreflight> => {
	const grouped = new Map<string, CaddyMigrationRuntimePreflightCheck>();
	for (const ref of refs) {
		const dial = `${ref.normalizedHost}:${ref.normalizedPort}`;
		const groupKey = `${ref.network}\0${dial}`;
		grouped.set(groupKey, {
			dial,
			host: ref.normalizedHost,
			port: ref.normalizedPort,
			network: ref.network,
			status: "passed",
			routes: [...(grouped.get(groupKey)?.routes ?? []), ref],
		});
	}

	const checks = [...invalidChecks, ...grouped.values()];
	const probeableChecks = checks.filter((item) => item.port > 0);
	let probeMode: ProbeMode = "standalone";
	for (const check of probeableChecks) {
		const probeResult = await probeUpstream(
			check.host,
			check.port,
			check.network,
			serverId,
		);
		if (probeResult.probeMode === "service") {
			probeMode = "service";
		}
		const { failureReason } = probeResult;
		if (failureReason) {
			check.status = "failed";
			check.reason = failureReason;
		}
	}
	const networks = [...new Set(checks.map((check) => check.network))].sort();

	return {
		status: checks.some((check) => check.status === "failed")
			? "failed"
			: "passed",
		checkedAt: new Date().toISOString(),
		network:
			networks.length <= 1 ? (networks[0] ?? DEFAULT_PROBE_NETWORK) : "mixed",
		networks: networks.length > 0 ? networks : [DEFAULT_PROBE_NETWORK],
		probeMode,
		probeImage: PROBE_IMAGE,
		checks,
	};
};

/**
 * Probe the upstreams referenced by the active fragment store. Normal Caddy
 * image replacement uses this in addition to the one-time migration preflight
 * so a syntactically valid config cannot replace the edge while an app network
 * or upstream is unreachable.
 */
export const runActiveCaddyUpstreamPreflight = async (
	input: { serverId?: string } = {},
): Promise<CaddyMigrationRuntimePreflight> => {
	try {
		const fragments = await readCaddyRouteFragments({
			serverId: input.serverId,
		});
		const { refs, invalidChecks } = collectPreflightInputs(fragments);
		return runUpstreamPreflight(refs, invalidChecks, input.serverId);
	} catch (error) {
		return failedFragmentReadPreflight(error);
	}
};

export const runCaddyMigrationUpstreamPreflight = async (
	report: CaddyMigrationReport,
	input: { serverId?: string } = {},
): Promise<CaddyMigrationRuntimePreflight> => {
	try {
		const { refs, invalidChecks } = await readPreflightInputs(
			report,
			input.serverId,
		);
		return runUpstreamPreflight(refs, invalidChecks, input.serverId);
	} catch (error) {
		return failedFragmentReadPreflight(error);
	}
};

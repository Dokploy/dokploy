import { quote } from "shell-quote";
import { stringify } from "yaml";
import type { ComposeSpecification, DefinitionsService } from "./types";

type Labels = Record<string, string>;

export const greenStackName = (appName: string) => `${appName}-green`;

const SERVER_LABEL =
	/^(traefik\.http\.services\.[^.=]+\.loadbalancer\.server)\.(port|url)$/;
const LB_SWARM_LABEL = "traefik.swarm.lbswarm";

const readLabels = (labels: DefinitionsService["labels"]): Labels => {
	if (!labels) return {};
	if (Array.isArray(labels)) {
		return Object.fromEntries(
			labels.map((label) => {
				const at = label.indexOf("=");
				return at < 0 ? [label, ""] : [label.slice(0, at), label.slice(at + 1)];
			}),
		);
	}
	return Object.fromEntries(
		Object.entries(labels).map(([key, value]) => [key, String(value ?? "")]),
	);
};

const writeLabels = (
	original: DefinitionsService["labels"],
	labels: Labels,
): DefinitionsService["labels"] =>
	Array.isArray(original)
		? Object.entries(labels).map(([key, value]) => `${key}=${value}`)
		: labels;

const clone = (spec: ComposeSpecification): ComposeSpecification =>
	JSON.parse(JSON.stringify(spec));

/** Why a stack can't be deployed blue/green, or null when it can. */
export const stackBlueGreenIneligibility = (
	spec: ComposeSpecification,
): string | null => {
	const services = Object.values(spec.services ?? {});
	if (services.length === 0) return "the stack has no services";
	let routed = false;
	for (const service of services) {
		if (service.volumes && service.volumes.length > 0) {
			return "a service mounts volumes, which two copies would share";
		}
		if (service.ports && service.ports.length > 0) {
			return "a service publishes ports, which two copies can't both bind";
		}
		const mode = service.deploy?.mode;
		if (mode && mode !== "replicated") {
			return `a service runs in ${mode} mode`;
		}
		if (service.deploy?.replicas === 0) return "a service has 0 replicas";
		const labels = readLabels(service.deploy?.labels);
		if (Object.keys(labels).some((key) => SERVER_LABEL.test(key))) {
			routed = true;
		}
	}
	return routed ? null : "no service has a domain";
};

export const stripTraefikAndDokployLabels = (
	spec: ComposeSpecification,
): ComposeSpecification => {
	const result = clone(spec);
	for (const service of Object.values(result.services ?? {})) {
		for (const holder of [service, service.deploy]) {
			if (!holder?.labels) continue;
			const kept = Object.fromEntries(
				Object.entries(readLabels(holder.labels)).filter(
					([key]) => !key.startsWith("traefik.") && !key.startsWith("dokploy."),
				),
			);
			holder.labels = writeLabels(holder.labels, kept);
		}
	}
	return result;
};

export interface ServiceRedirect {
	service: string;
	remove: string[];
	add: Labels;
}

/**
 * Points each domain of the stack at the matching service of the green stack,
 * by URL. A URL label routes to a name Traefik resolves on each connection,
 * so no label naming the real service's tasks stays behind.
 */
export const redirectToGreen = (spec: ComposeSpecification, appName: string) => {
	const green = greenStackName(appName);
	const result = clone(spec);
	const redirects: ServiceRedirect[] = [];
	for (const [name, service] of Object.entries(result.services ?? {})) {
		if (!service.deploy?.labels) continue;
		const labels = readLabels(service.deploy.labels);
		const remove: string[] = [];
		const add: Labels = {};
		for (const [key, value] of Object.entries(labels)) {
			const match = SERVER_LABEL.exec(key);
			if (!match) continue;
			const [, base, kind] = match;
			const port = kind === "port" ? value : /:(\d+)(?:\/|$)/.exec(value)?.[1];
			if (!port) continue;
			remove.push(key);
			add[`${base}.url`] = `http://${green}_${name}:${port}`;
		}
		if (remove.length === 0) continue;
		if (LB_SWARM_LABEL in labels) remove.push(LB_SWARM_LABEL);
		for (const key of remove) delete labels[key];
		Object.assign(labels, add);
		service.deploy.labels = writeLabels(service.deploy.labels, labels);
		// `--label-add` runs before `--label-rm`, so a key being replaced must
		// not be removed too.
		redirects.push({
			service: name,
			remove: [...new Set(remove)].filter((key) => !(key in add)),
			add,
		});
	}
	return { spec: result, redirects };
};

const dockerDeploy = (file: string, stack: string) =>
	`docker stack deploy -c ${quote([file])} ${quote([stack])} --prune --with-registry-auth`;

/**
 * The shell for a blue/green stack deploy, run in place of the single
 * `docker stack deploy` when the stack already runs. `exportEnv` is the
 * environment the deploy passes to docker. Everything that fails after the
 * green stack exists puts the real services' labels back and removes it.
 */
export const getStackBlueGreenScript = ({
	appName,
	composeFile,
	exportEnv,
	spec,
	waitSeconds = 300,
	settleSeconds = 12,
}: {
	appName: string;
	composeFile: string;
	exportEnv: string;
	spec: ComposeSpecification;
	waitSeconds?: number;
	settleSeconds?: number;
}) => {
	const green = greenStackName(appName);
	const greenFile = `${composeFile}.bg-green.yml`;
	const redirectFile = `${composeFile}.bg-redirect.yml`;
	const { spec: redirectSpec, redirects } = redirectToGreen(spec, appName);
	const files = [
		[greenFile, stringify(stripTraefikAndDokployLabels(spec), { lineWidth: 1000 })],
		[redirectFile, stringify(redirectSpec, { lineWidth: 1000 })],
	] as const;
	const write = files
		.map(
			([file, content]) =>
				`printf %s ${quote([Buffer.from(content).toString("base64")])} | base64 -d > ${quote([file])}`,
		)
		.join("\n");
	const deploy = (file: string, stack: string) =>
		`env -i PATH="$PATH" HOME="$HOME" ${exportEnv} ${dockerDeploy(file, stack)}`;

	const saveLabels = redirects
		.map(
			({ service }) =>
				`docker service inspect -f '{{range $k,$v := .Spec.Labels}}{{$k}}={{$v}}{{"\\n"}}{{end}}' ${quote([`${appName}_${service}`])} 2>/dev/null | grep -E '^traefik\\.(http\\.services\\..*\\.loadbalancer\\.server\\.(port|url)|swarm\\.lbswarm)=' > ${quote([`${redirectFile}.${service}.saved`])} || true`,
		)
		.join("\n");
	const redirectLive = redirects
		.map(({ service, remove, add }) => {
			const flags = [
				...remove.map((key) => `--label-rm ${quote([key])}`),
				...Object.entries(add).map(
					([key, value]) => `--label-add ${quote([`${key}=${value}`])}`,
				),
			].join(" ");
			return `if docker service inspect ${quote([`${appName}_${service}`])} >/dev/null 2>&1; then docker service update --detach ${flags} ${quote([`${appName}_${service}`])} >/dev/null; fi`;
		})
		.join("\n");
	const restoreLive = redirects
		.map(({ service, remove, add }) => {
			const name = `${appName}_${service}`;
			// A label the redirect added and the live service never had must go
			// too, or the route keeps pointing at the green stack.
			const undo = [...new Set([...remove, ...Object.keys(add)])];
			const saved = `${redirectFile}.${service}.saved`;
			return `if [ -f ${quote([saved])} ] && docker service inspect ${quote([name])} >/dev/null 2>&1; then
  args=""; for l in $(cat ${quote([saved])}); do args="$args --label-add $l"; done
  rm_args=""; for k in ${undo.map((key) => quote([key])).join(" ")}; do grep -q "^$k=" ${quote([saved])} || rm_args="$rm_args --label-rm $k"; done
  docker service update --detach $rm_args $args ${quote([name])} >/dev/null 2>&1 || true
fi`;
		})
		.join("\n");

	return `
bg_stack_ready() {
  end=$(( $(date +%s) + ${waitSeconds} ))
  while :; do
    out=$(docker service ls --filter label=com.docker.stack.namespace=$1 --format '{{.Replicas}}')
    if [ -n "$out" ] && ! echo "$out" | awk -F'[/ ]' '$1!=$2 {bad=1} END{exit !bad}'; then return 0; fi
    [ $(date +%s) -ge $end ] && return 1
    sleep 2
  done
}
bg_stack_gone() {
  docker stack rm ${quote([green])} >/dev/null 2>&1 || true
  i=0; while [ -n "$(docker service ls -q --filter label=com.docker.stack.namespace=${quote([green])})" ] && [ $i -lt 60 ]; do sleep 1; i=$((i+1)); done
}
bg_restore() {
${restoreLive}
}
bg_fail() {
  echo "Blue/green: $1; the running version keeps serving"
  bg_restore
  bg_stack_gone
  exit 1
}
bg_service_state() {
  docker service inspect -f '{{.Version.Index}} {{if .UpdateStatus}}{{.UpdateStatus.StartedAt}}|{{.UpdateStatus.State}}{{end}}' "$1" 2>/dev/null
}
bg_update_done() {
  start=$(date +%s); end=$(( start + ${waitSeconds} ))
  before_index="\${2%% *}"; before_started="\${2#* }"; before_started="\${before_started%%|*}"
  while :; do
    now=$(bg_service_state "$1")
    [ "\${now%% *}" = "$before_index" ] && return 0
    started="\${now#* }"; state="\${started#*|}"; started="\${started%%|*}"
    if [ "$started" != "$before_started" ]; then
      case "$state" in
        completed) return 0 ;;
        paused|rollback_started|rollback_paused|rollback_completed) return 1 ;;
      esac
    elif [ $(( $(date +%s) - start )) -ge 20 ]; then
      return 0
    fi
    [ $(date +%s) -ge $end ] && return 1
    sleep 2
  done
}

if [ -n "$(docker service ls -q --filter label=com.docker.stack.namespace=${quote([appName])})" ]; then
  echo "Blue/green: starting the new version next to the running one"
  ${write}
  bg_stack_gone
  ${deploy(greenFile, green)} || bg_fail "the new version could not be created"
  bg_stack_ready ${quote([green])} || bg_fail "the new version did not become healthy"
  sleep 5
  bg_stack_ready ${quote([green])} || bg_fail "the new version did not stay healthy"
${saveLabels}
${redirectLive}
  echo "Blue/green: traffic moved to the new version"
  sleep ${settleSeconds}
  BG_BEFORE=""
  for s in $(docker service ls --filter label=com.docker.stack.namespace=${quote([appName])} --format '{{.Name}}'); do BG_BEFORE="$BG_BEFORE $s=$(bg_service_state "$s" | tr ' ' '_')"; done
  ${deploy(redirectFile, appName)} || bg_fail "updating the running version failed"
  for entry in $BG_BEFORE; do
    s="\${entry%%=*}"; before="$(echo "\${entry#*=}" | tr '_' ' ')"
    bg_update_done "$s" "$before" || bg_fail "updating $s did not complete"
  done
  ${deploy(composeFile, appName)} || bg_fail "restoring the routes failed"
  sleep ${settleSeconds}
  bg_stack_gone
  rm -f ${quote([greenFile])} ${quote([redirectFile])} ${quote([redirectFile])}.*.saved
  echo "Blue/green: done, the previous version was removed"
else
  ${deploy(composeFile, appName)}
fi
`;
};

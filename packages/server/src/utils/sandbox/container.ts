import type Dockerode from "dockerode";

export const SANDBOX_LABEL = "dokploy.sandbox";
export const SANDBOX_ID_LABEL = "dokploy.sandboxId";
export const SANDBOX_ORGANIZATION_LABEL = "dokploy.organizationId";
export const SANDBOX_ISOLATED_NETWORK = "dokploy-sandboxes-isolated";
export const SANDBOX_INTERNET_NETWORK = "dokploy-sandboxes";
export const SANDBOX_STATE_DIR = "/.dokploy";
export const SANDBOX_ACTIVITY_FILE = `${SANDBOX_STATE_DIR}/activity`;
export const SANDBOX_TIMEOUT_FILE = `${SANDBOX_STATE_DIR}/timeout`;
export const SANDBOX_ROOT_USER = "0:0";
export const SANDBOX_DEFAULT_USER = "1000:1000";
export const SANDBOX_IDLE_CHECK_SECONDS = 5;

export type SandboxNetworkMode = "isolated" | "internet";

export interface SandboxContainerSpec {
	sandboxId: string;
	organizationId: string;
	image: string;
	cpu: number;
	memoryMb: number;
	pidsLimit: number;
	networkMode: SandboxNetworkMode;
	envVars?: string | null;
	workdir: string;
	timeoutMs: number;
	deadlineAt: Date;
	runtime?: string | null;
}

export const getSandboxNetworkName = (mode: SandboxNetworkMode) =>
	mode === "internet" ? SANDBOX_INTERNET_NETWORK : SANDBOX_ISOLATED_NETWORK;

export const getSandboxContainerName = (sandboxId: string) =>
	`dokploy-sandbox-${sandboxId}`;

export const getSandboxExpiry = (
	now: Date,
	timeoutMs: number,
	deadlineAt: Date,
) => new Date(Math.min(now.getTime() + timeoutMs, deadlineAt.getTime()));

export const toSandboxTimeoutSeconds = (timeoutMs: number) =>
	Math.ceil(timeoutMs / 1000);

export const withSandboxActivity = (cmd: string) =>
	`echo 1 2>/dev/null > ${SANDBOX_ACTIVITY_FILE}; ${cmd}`;

export const buildSandboxTimeoutCommand = (timeoutMs: number) =>
	`echo ${toSandboxTimeoutSeconds(timeoutMs)} > ${SANDBOX_TIMEOUT_FILE} && echo 1 > ${SANDBOX_ACTIVITY_FILE}`;

export const buildSandboxLifetimeCommand = (
	deadlineAt: Date,
	timeoutMs: number,
) => {
	const deadline = Math.floor(deadlineAt.getTime() / 1000);
	const tick = SANDBOX_IDLE_CHECK_SECONDS;
	const a = SANDBOX_ACTIVITY_FILE;
	const t = SANDBOX_TIMEOUT_FILE;
	const script = [
		`mkdir -p ${SANDBOX_STATE_DIR} 2>/dev/null`,
		`echo ${toSandboxTimeoutSeconds(timeoutMs)} 2>/dev/null > ${t}`,
		`echo 0 2>/dev/null > ${a}`,
		`chmod 666 ${a} 2>/dev/null`,
		"(",
		"idle=0",
		`while sleep ${tick}; do`,
		`x=; read -r x 2>/dev/null < ${a}`,
		`if [ "$x" = 1 ]; then echo 0 2>/dev/null > ${a}; idle=0; else idle=$((idle + ${tick})); fi`,
		`i=; read -r i 2>/dev/null < ${t}`,
		`case "$i" in ''|*[!0-9]*) continue;; esac`,
		`if [ "$idle" -ge "$i" ]; then kill $$; exit 0; fi`,
		"done",
		") &",
		`exec sleep $(( ${deadline} - $(date +%s) ))`,
	];
	return ["sh", "-c", script.join("\n")];
};

export const parseSandboxEnvVars = (envVars?: string | null): string[] => {
	if (!envVars) return [];
	return envVars
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line && !line.startsWith("#") && line.includes("="));
};

export const parseSandboxUser = (
	user?: string | null,
): { uid: number; gid: number } | null => {
	if (!user) return null;
	const [uidPart, gidPart] = user.split(":");
	const uid = Number.parseInt(uidPart ?? "", 10);
	const gid = Number.parseInt(gidPart ?? uidPart ?? "", 10);
	if (!Number.isInteger(uid) || uid < 0) return null;
	return { uid, gid: Number.isInteger(gid) && gid >= 0 ? gid : uid };
};

export const buildSandboxContainerOptions = (
	spec: SandboxContainerSpec,
): Dockerode.ContainerCreateOptions => {
	const memory = Math.round(spec.memoryMb * 1024 * 1024);
	return {
		name: getSandboxContainerName(spec.sandboxId),
		Image: spec.image,
		Entrypoint: [""],
		Cmd: buildSandboxLifetimeCommand(spec.deadlineAt, spec.timeoutMs),
		WorkingDir: spec.workdir,
		Env: [`HOME=${spec.workdir}`, ...parseSandboxEnvVars(spec.envVars)],
		User: SANDBOX_ROOT_USER,
		Labels: {
			[SANDBOX_LABEL]: "true",
			[SANDBOX_ID_LABEL]: spec.sandboxId,
			[SANDBOX_ORGANIZATION_LABEL]: spec.organizationId,
		},
		HostConfig: {
			Init: true,
			NanoCpus: Math.round(spec.cpu * 1e9),
			Memory: memory,
			MemorySwap: memory,
			PidsLimit: spec.pidsLimit,
			CapDrop: ["ALL"],
			SecurityOpt: ["no-new-privileges"],
			RestartPolicy: { Name: "no" },
			AutoRemove: true,
			LogConfig: {
				Type: "json-file",
				Config: { "max-size": "10m", "max-file": "1" },
			},
			NetworkMode: getSandboxNetworkName(spec.networkMode),
			...(spec.runtime ? { Runtime: spec.runtime } : {}),
		},
	};
};

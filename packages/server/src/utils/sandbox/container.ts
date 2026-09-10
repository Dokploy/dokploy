import type Dockerode from "dockerode";

export const SANDBOX_LABEL = "dokploy.sandbox";
export const SANDBOX_ID_LABEL = "dokploy.sandboxId";
export const SANDBOX_PROJECT_LABEL = "dokploy.projectId";
export const SANDBOX_ENVIRONMENT_LABEL = "dokploy.environmentId";
export const SANDBOX_ISOLATED_NETWORK = "dokploy-sandboxes-isolated";
export const SANDBOX_INTERNET_NETWORK = "dokploy-sandboxes";

export type SandboxNetworkMode = "isolated" | "internet";

export interface SandboxContainerSpec {
	sandboxId: string;
	projectId: string;
	environmentId: string;
	image: string;
	cpu: number;
	memoryMb: number;
	pidsLimit: number;
	networkMode: SandboxNetworkMode;
	envVars?: string | null;
	workdir: string;
	user?: string | null;
}

export const getSandboxNetworkName = (mode: SandboxNetworkMode) =>
	mode === "internet" ? SANDBOX_INTERNET_NETWORK : SANDBOX_ISOLATED_NETWORK;

export const getSandboxContainerName = (sandboxId: string) =>
	`dokploy-sandbox-${sandboxId}`;

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
		// [""] resets the image entrypoint so Cmd always becomes PID 1.
		Entrypoint: [""],
		Cmd: ["tail", "-f", "/dev/null"],
		WorkingDir: spec.workdir,
		Env: [`HOME=${spec.workdir}`, ...parseSandboxEnvVars(spec.envVars)],
		...(spec.user ? { User: spec.user } : {}),
		Labels: {
			[SANDBOX_LABEL]: "true",
			[SANDBOX_ID_LABEL]: spec.sandboxId,
			[SANDBOX_PROJECT_LABEL]: spec.projectId,
			[SANDBOX_ENVIRONMENT_LABEL]: spec.environmentId,
		},
		HostConfig: {
			// docker-init (tini) as PID 1 reaps the orphans left behind when a
			// timed-out command's shell is killed; `tail` would leave zombies.
			Init: true,
			NanoCpus: Math.round(spec.cpu * 1e9),
			Memory: memory,
			MemorySwap: memory,
			PidsLimit: spec.pidsLimit,
			CapDrop: ["ALL"],
			SecurityOpt: ["no-new-privileges"],
			RestartPolicy: { Name: "no" },
			LogConfig: {
				Type: "json-file",
				Config: { "max-size": "10m", "max-file": "1" },
			},
			NetworkMode: getSandboxNetworkName(spec.networkMode),
		},
	};
};

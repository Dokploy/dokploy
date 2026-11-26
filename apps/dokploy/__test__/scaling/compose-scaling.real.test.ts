import { execFile } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { docker, paths } from "@dokploy/server/constants";
import { db } from "@dokploy/server/db";
import {
	applyReplicaOverrides,
	saveComposeReplicaOverride,
} from "@dokploy/server/services/scaling/compose-overrides";
import { setComposeServiceReplicas } from "@dokploy/server/services/scaling/compose-scale";
import {
	composeSnapshotArgs,
	composeSnapshotFiles,
	readComposeSnapshot,
	runDockerCli,
} from "@dokploy/server/services/scaling/compose-snapshot";
import type { ScalableCompose } from "@dokploy/server/services/scaling/compose-status";
import { waitForSwarmServiceConvergence } from "@dokploy/server/utils/docker/utils";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { parse, stringify } from "yaml";
import { REAL_TEST_TIMEOUT, runRealSwarmTests, waitFor } from "./real-swarm";

vi.mock(
	"@dokploy/server/services/scaling/compose-overrides",
	async (importActual) => ({
		...(await importActual<
			typeof import("@dokploy/server/services/scaling/compose-overrides")
		>()),
		saveComposeReplicaOverride: vi.fn(),
	}),
);

const execFileAsync = promisify(execFile);
const IMAGE = "traefik/whoami:v1.10.3";
const suffix = Date.now().toString(36);

vi.mocked(db.insert).mockReturnValue({
	values: () => ({ returning: async () => [{}] }),
} as never);

const composeOf = (
	appName: string,
	composeType: ScalableCompose["composeType"],
): ScalableCompose => ({
	composeId: `real-${appName}`,
	appName,
	serverId: null,
	sourceType: "raw",
	composePath: "docker-compose.yml",
	composeType,
	createEnvFile: true,
	command: "",
	composeStatus: "done",
	server: null,
});

const PLAIN_FILE = `
services:
  web:
    image: ${IMAGE}
    labels:
      - test.marker=\${MARKER}
`;

/** Writes what a successful deploy leaves behind: code/ and the snapshot. */
const writeDeployedFiles = (compose: ScalableCompose, yaml: string) => {
	const { COMPOSE_PATH } = paths(false);
	const codeDir = join(COMPOSE_PATH, compose.appName, "code");
	const files = composeSnapshotFiles(compose);
	mkdirSync(codeDir, { recursive: true });
	mkdirSync(files.dir, { recursive: true });
	writeFileSync(join(codeDir, "docker-compose.yml"), yaml);
	writeFileSync(join(codeDir, ".env"), "MARKER=from-env\n");
	writeFileSync(files.compose, yaml);
	writeFileSync(files.env, "MARKER=from-env\n");
	writeFileSync(
		files.meta,
		JSON.stringify({
			version: 1,
			composeType: compose.composeType,
			projectDirectory: codeDir,
		}),
	);
	return { codeDir, files };
};

const serviceContainers = async (project: string, service: string) =>
	(
		await docker.listContainers({
			all: true,
			filters: JSON.stringify({
				label: [
					`com.docker.compose.project=${project}`,
					`com.docker.compose.service=${service}`,
				],
			}),
		})
	).sort(
		(a, b) =>
			Number(a.Labels["com.docker.compose.container-number"]) -
			Number(b.Labels["com.docker.compose.container-number"]),
	);

describe.runIf(runRealSwarmTests)("compose scaling (real Docker)", () => {
	const plain = composeOf(`compose-real-${suffix}`, "docker-compose");
	const stack = composeOf(`stack-real-${suffix}`, "stack");

	beforeAll(async () => {
		await execFileAsync("docker", ["pull", IMAGE]);
	}, REAL_TEST_TIMEOUT);

	afterAll(async () => {
		await execFileAsync("docker", [
			"compose",
			"-p",
			plain.appName,
			"down",
			"--remove-orphans",
		]).catch(() => undefined);
		await execFileAsync("docker", ["stack", "rm", stack.appName]).catch(
			() => undefined,
		);
		const { COMPOSE_PATH } = paths(false);
		for (const app of [plain.appName, stack.appName]) {
			rmSync(join(COMPOSE_PATH, app), { recursive: true, force: true });
		}
	});

	it(
		"scales plain compose from the snapshot without touching running containers",
		async () => {
			const { codeDir, files } = writeDeployedFiles(plain, PLAIN_FILE);
			const snapshot = await readComposeSnapshot(plain);
			if (!snapshot) throw new Error("snapshot missing");
			await runDockerCli(plain, snapshot, [
				...composeSnapshotArgs(plain, snapshot),
				"up",
				"-d",
			]);
			const [first] = await serviceContainers(plain.appName, "web");
			if (!first) throw new Error("compose did not start the service");
			const firstStarted = (await docker.getContainer(first.Id).inspect()).State
				.StartedAt;

			const up = await setComposeServiceReplicas({
				compose: plain,
				serviceName: "web",
				replicas: 3,
				userId: null,
			});
			expect(up).toMatchObject({ from: 1, to: 3, applied: true });
			const three = await serviceContainers(plain.appName, "web");
			expect(three.map((c) => c.State)).toEqual([
				"running",
				"running",
				"running",
			]);
			expect(three[0]?.Id).toBe(first.Id);
			expect(
				(await docker.getContainer(first.Id).inspect()).State.StartedAt,
			).toBe(firstStarted);
			// New replicas were interpolated with the snapshot's env file.
			expect(three[2]?.Labels["test.marker"]).toBe("from-env");

			// A preview re-clones code/ from scratch; scaling must not need it.
			rmSync(codeDir, { recursive: true, force: true });
			const down = await setComposeServiceReplicas({
				compose: plain,
				serviceName: "web",
				replicas: 2,
				userId: null,
			});
			expect(down).toMatchObject({ from: 3, to: 2, applied: true });
			const two = await serviceContainers(plain.appName, "web");
			expect(
				two.map((c) => c.Labels["com.docker.compose.container-number"]),
			).toEqual(["1", "2"]);
			expect(
				parse(readFileSync(files.compose, "utf8")).services.web.deploy,
			).toEqual({ replicas: 2 });

			// Stop + Start from the snapshot keeps the scaled count.
			await execFileAsync("docker", ["compose", "-p", plain.appName, "stop"]);
			await runDockerCli(plain, snapshot, [
				...composeSnapshotArgs(plain, snapshot),
				"up",
				"-d",
			]);
			const restarted = await serviceContainers(plain.appName, "web");
			expect(restarted.filter((c) => c.State === "running")).toHaveLength(2);

			// A stopped replica (for example during a volume backup) blocks scaling.
			await execFileAsync("docker", ["stop", restarted[1]?.Id as string]);
			await expect(
				setComposeServiceReplicas({
					compose: plain,
					serviceName: "web",
					replicas: 3,
					userId: null,
				}),
			).rejects.toMatchObject({ reason: "replicas_stopped" });
			expect(await serviceContainers(plain.appName, "web")).toHaveLength(2);
			expect(saveComposeReplicaOverride).toHaveBeenCalled();
		},
		REAL_TEST_TIMEOUT,
	);

	it(
		"keeps a stack service's count across redeploys only with the override",
		async () => {
			const raw = `services:\n  web:\n    image: ${IMAGE}\n`;
			const { codeDir } = writeDeployedFiles(stack, raw);
			const deploy = async (yaml: string) => {
				const file = join(codeDir, "docker-compose.yml");
				writeFileSync(file, yaml);
				await execFileAsync("docker", [
					"stack",
					"deploy",
					"-c",
					file,
					stack.appName,
				]);
			};
			const serviceName = `${stack.appName}_web`;
			const replicasOf = async () =>
				(await docker.getService(serviceName).inspect()).Spec.Mode.Replicated
					.Replicas;

			await deploy(raw);
			await waitForSwarmServiceConvergence(serviceName, null, {
				timeoutMs: 120_000,
			});
			const before = await docker.listTasks({
				filters: JSON.stringify({ service: [serviceName] }),
			});

			const result = await setComposeServiceReplicas({
				compose: stack,
				serviceName: "web",
				replicas: 3,
				userId: null,
			});
			expect(result).toMatchObject({ from: 1, to: 3, applied: true });
			await waitForSwarmServiceConvergence(serviceName, null, {
				timeoutMs: 120_000,
			});
			const after = await docker.listTasks({
				filters: JSON.stringify({
					service: [serviceName],
					"desired-state": ["running"],
				}),
			});
			expect(after).toHaveLength(3);
			expect(after.map((task) => task.ID)).toEqual(
				expect.arrayContaining(before.map((task) => task.ID)),
			);

			const injected = parse(raw);
			applyReplicaOverrides(
				injected,
				[{ serviceName: "web", replicas: 3 }],
				"stack",
			);
			await deploy(stringify(injected));
			expect(await replicasOf()).toBe(3);

			await deploy(raw);
			expect(
				await waitFor(replicasOf, (replicas) => replicas === 1, 30_000),
			).toBe(1);
		},
		REAL_TEST_TIMEOUT,
	);
});

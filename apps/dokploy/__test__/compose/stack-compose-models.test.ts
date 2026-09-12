import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { db } from "@dokploy/server/db";
import {
	createCommand,
	getBuildComposeCommand,
} from "@dokploy/server/utils/builders/compose";
import {
	addDomainToCompose,
	composeSpecificationUsesModels,
	isStackDeployCommand,
	STACK_COMPOSE_MODELS_ERROR,
	writeDomainsToCompose,
} from "@dokploy/server/utils/docker/domain";
import type { ComposeSpecification } from "@dokploy/server/utils/docker/types";
import {
	afterAll,
	afterEach,
	beforeAll,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import { parse, stringify } from "yaml";

const disk = vi.hoisted(() => ({
	yaml: "services:\n  app:\n    image: nginx:alpine\n",
}));

vi.mock("node:fs", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:fs")>();
	return {
		...actual,
		existsSync: (p: Parameters<typeof actual.existsSync>[0]) => {
			const path = String(p);
			if (path.includes("/code/") && path.endsWith("docker-compose.yml")) {
				return true;
			}
			return actual.existsSync(p);
		},
		readFileSync: (
			p: Parameters<typeof actual.readFileSync>[0],
			enc?: BufferEncoding,
		) => {
			const path = String(p);
			if (path.includes("/code/") && path.endsWith("docker-compose.yml")) {
				return disk.yaml;
			}
			return actual.readFileSync(p, enc as never);
		},
	};
});

const yaml = (spec: unknown) => stringify(spec, { lineWidth: 1000 });

const spec = (extra: Record<string, unknown> = {}): ComposeSpecification => ({
	services: {
		app: { image: "nginx:alpine" },
	},
	...extra,
});

const compose = (
	overrides: Record<string, unknown> = {},
): Parameters<typeof writeDomainsToCompose>[0] =>
	({
		appName: "demo",
		composeFile: yaml(spec()),
		composePath: "docker-compose.yml",
		composeType: "stack",
		command: "",
		isolatedDeployment: false,
		isolatedDeploymentsVolume: false,
		randomize: false,
		serverId: null,
		sourceType: "raw",
		suffix: "",
		env: "",
		createEnvFile: false,
		mounts: [],
		domains: [],
		environment: { project: { env: "" }, env: "" },
		...overrides,
	}) as unknown as Parameters<typeof writeDomainsToCompose>[0];

const writeDeploy = (c: ReturnType<typeof compose>) =>
	writeDomainsToCompose(c, [], createCommand(c as never));

describe("composeSpecificationUsesModels", () => {
	it("detects top-level and service-level models structurally", () => {
		expect(composeSpecificationUsesModels(spec())).toBe(false);
		expect(
			composeSpecificationUsesModels(
				spec({ models: { llm: { model: "ai/smollm2" } } }),
			),
		).toBe(true);
		expect(
			composeSpecificationUsesModels({
				services: { app: { image: "nginx:alpine", models: ["llm"] } },
			}),
		).toBe(true);
		expect(composeSpecificationUsesModels(spec({ models: {} }))).toBe(true);
		expect(composeSpecificationUsesModels(spec({ models: null }))).toBe(true);
		expect(composeSpecificationUsesModels(spec({ models: [] }))).toBe(true);
		expect(composeSpecificationUsesModels(spec({ models: "foo" }))).toBe(true);
		expect(composeSpecificationUsesModels(spec({ models: 123 }))).toBe(true);
		expect(
			composeSpecificationUsesModels({
				services: { app: { image: "nginx:alpine", models: [] } },
			}),
		).toBe(true);
		expect(
			composeSpecificationUsesModels({
				services: { app: { image: "nginx:alpine", models: null } },
			} as unknown as ComposeSpecification),
		).toBe(true);
	});

	it("does not treat x-models or the word models in strings as models", () => {
		expect(
			composeSpecificationUsesModels(
				spec({ "x-models": { llm: { model: "ai/smollm2" } } }),
			),
		).toBe(false);
		const fromStrings = parse(`
services:
  app:
    image: nginx:alpine
    # models: fake
    environment:
      NOTE: "models: in env"
    labels:
      info: "models: in label"
    command: ["echo", "models: in command"]
`) as ComposeSpecification;
		expect(composeSpecificationUsesModels(fromStrings)).toBe(false);
	});

	it("detects stack deploy from the first two command tokens", () => {
		expect(
			isStackDeployCommand("stack deploy -c docker-compose.yml demo"),
		).toBe(true);
		expect(
			isStackDeployCommand("  stack   deploy  -c docker-compose.yml demo"),
		).toBe(true);
		expect(
			isStackDeployCommand("compose -p demo -f docker-compose.yml up -d"),
		).toBe(false);
		expect(
			isStackDeployCommand("compose -f my-stack deploy-file.yml up -d"),
		).toBe(false);
	});

	it("skips Docker root global options before stack deploy", () => {
		const file = "stack deploy -c docker-compose.yml demo";
		expect(isStackDeployCommand(`--context remote ${file}`)).toBe(true);
		expect(isStackDeployCommand(`--context=remote ${file}`)).toBe(true);
		expect(isStackDeployCommand(`-c remote ${file}`)).toBe(true);
		expect(isStackDeployCommand(`-c=remote ${file}`)).toBe(true);
		expect(isStackDeployCommand(`-cremote ${file}`)).toBe(true);
		expect(isStackDeployCommand(`-D ${file}`)).toBe(true);
		expect(isStackDeployCommand(`--debug ${file}`)).toBe(true);
		expect(isStackDeployCommand(`--debug=true ${file}`)).toBe(true);
		expect(isStackDeployCommand(`--tlsverify ${file}`)).toBe(true);
		expect(isStackDeployCommand(`--config /tmp/config ${file}`)).toBe(true);
		expect(isStackDeployCommand(`--config=deploy ${file}`)).toBe(true);
		expect(isStackDeployCommand(`-H unix:///var/run/docker.sock ${file}`)).toBe(
			true,
		);
		expect(isStackDeployCommand(`-Hunix:///var/run/docker.sock ${file}`)).toBe(
			true,
		);
		expect(
			isStackDeployCommand(`--context remote -D --tlsverify ${file}`),
		).toBe(true);
		expect(isStackDeployCommand(`-- ${file}`)).toBe(true);
		expect(isStackDeployCommand(`-Dc remote ${file}`)).toBe(true);
		expect(isStackDeployCommand(`--config deploy ${file}`)).toBe(true);
		expect(isStackDeployCommand(`--log-level=debug ${file}`)).toBe(true);
		expect(isStackDeployCommand(`-v ${file}`)).toBe(true);
		expect(isStackDeployCommand(`--config stack ${file}`)).toBe(true);
	});

	it("does not treat option values or compose args as stack deploy", () => {
		expect(isStackDeployCommand("--context remote compose up")).toBe(false);
		expect(isStackDeployCommand("-D compose up")).toBe(false);
		expect(isStackDeployCommand("compose run app stack deploy")).toBe(false);
		expect(isStackDeployCommand("compose exec app stack deploy")).toBe(false);
		expect(isStackDeployCommand("compose -f my-stack deploy-file.yml up")).toBe(
			false,
		);
		expect(isStackDeployCommand("--context stack compose up")).toBe(false);
		expect(isStackDeployCommand("compose run app stack deploy")).toBe(false);
		expect(isStackDeployCommand("--context")).toBe(false);
		expect(isStackDeployCommand("--config")).toBe(false);
		expect(isStackDeployCommand("-H")).toBe(false);
		expect(isStackDeployCommand("-l")).toBe(false);
		expect(
			isStackDeployCommand(
				"--something-new value stack deploy -c file.yml demo",
			),
		).toBe(false);
		expect(isStackDeployCommand("stack --context remote deploy")).toBe(false);
		expect(isStackDeployCommand("-c stack deploy -c file.yml demo")).toBe(
			false,
		);
		expect(isStackDeployCommand("--debug false stack deploy --help")).toBe(
			false,
		);
		expect(isStackDeployCommand("-H stack deploy --help")).toBe(false);
		expect(isStackDeployCommand("-cD remote stack deploy --help")).toBe(false);
	});

	it("treats stack up as the documented stack deploy alias", () => {
		expect(isStackDeployCommand("stack up -c docker-compose.yml demo")).toBe(
			true,
		);
		expect(
			isStackDeployCommand("'stack' 'up' -c docker-compose.yml demo"),
		).toBe(true);
		expect(
			isStackDeployCommand(
				"--context remote stack up -c docker-compose.yml demo",
			),
		).toBe(true);
		expect(
			isStackDeployCommand(
				"--context=remote stack up -c docker-compose.yml demo",
			),
		).toBe(true);
		expect(isStackDeployCommand("-D stack up -c docker-compose.yml demo")).toBe(
			true,
		);
		expect(
			isStackDeployCommand("st\"ack\" u'p' -c docker-compose.yml demo"),
		).toBe(true);
	});

	it("does not treat compose commands as stack up", () => {
		expect(isStackDeployCommand("compose up")).toBe(false);
		expect(isStackDeployCommand("compose run app stack up")).toBe(false);
		expect(isStackDeployCommand("compose exec app stack up")).toBe(false);
		expect(isStackDeployCommand("compose -f stack.yml up")).toBe(false);
		expect(isStackDeployCommand("--context stack compose up")).toBe(false);
	});

	it("skips deprecated stack --orchestrator before deploy or up", () => {
		expect(
			isStackDeployCommand(
				"stack --orchestrator swarm deploy -c docker-compose.yml demo",
			),
		).toBe(true);
		expect(
			isStackDeployCommand(
				"stack --orchestrator=swarm up -c docker-compose.yml demo",
			),
		).toBe(true);
		expect(
			isStackDeployCommand(
				"--context remote stack --orchestrator swarm up -c docker-compose.yml demo",
			),
		).toBe(true);
		expect(isStackDeployCommand("stack --orchestrator deploy")).toBe(false);
		expect(
			isStackDeployCommand("stack --orchestrator deploy -c file.yml demo"),
		).toBe(false);
	});

	it("classifies quoted shell argv the way /bin/sh does", () => {
		expect(
			isStackDeployCommand("'stack' 'deploy' -c docker-compose.yml demo"),
		).toBe(true);
		expect(
			isStackDeployCommand("st\"ack\" de'ploy' -c docker-compose.yml demo"),
		).toBe(true);
		expect(
			isStackDeployCommand(
				'--config "/tmp/docker config" stack deploy -c file.yml demo',
			),
		).toBe(true);
		expect(
			isStackDeployCommand(
				"--config '/tmp/docker config' stack deploy -c file.yml demo",
			),
		).toBe(true);
		expect(
			isStackDeployCommand('--context "remote" stack deploy -c file.yml demo'),
		).toBe(true);
		expect(
			isStackDeployCommand("-c 'remote' stack deploy -c file.yml demo"),
		).toBe(true);
		expect(isStackDeployCommand("'compose' up")).toBe(false);
		expect(isStackDeployCommand("compose run app 'stack' 'deploy'")).toBe(
			false,
		);
		expect(isStackDeployCommand("stack\tdeploy -c file.yml demo")).toBe(true);
		expect(isStackDeployCommand('--context="" stack deploy --help')).toBe(true);
		expect(isStackDeployCommand("--context= stack deploy --help")).toBe(true);
		expect(isStackDeployCommand("--context '' stack deploy --help")).toBe(true);
		expect(isStackDeployCommand("-c '' stack deploy --help")).toBe(true);
		expect(
			isStackDeployCommand("stack deploy -c file.yml demo # trailing comment"),
		).toBe(true);
		expect(isStackDeployCommand("# stack deploy -c file.yml demo")).toBe(false);
		expect(isStackDeployCommand("~ stack deploy --help")).toBe(false);
		expect(isStackDeployCommand("'' stack deploy --help")).toBe(false);
	});

	it("does not crash on malformed quotes", () => {
		expect(() => isStackDeployCommand("'stack deploy")).not.toThrow();
		expect(() => isStackDeployCommand('"stack deploy')).not.toThrow();
		expect(() => isStackDeployCommand('stack "deploy')).not.toThrow();
	});

	it("does not crash on malformed specs", () => {
		expect(composeSpecificationUsesModels(null)).toBe(false);
		expect(composeSpecificationUsesModels(undefined)).toBe(false);
		expect(composeSpecificationUsesModels("nope" as never)).toBe(false);
		expect(
			composeSpecificationUsesModels({
				services: null,
			} as unknown as ComposeSpecification),
		).toBe(false);
		expect(
			composeSpecificationUsesModels({
				services: { app: "bad" },
			} as unknown as ComposeSpecification),
		).toBe(false);
	});
});

describe("stack deploy compatibility", () => {
	it("allows docker compose with models and stack without models", async () => {
		const withModels = compose({
			composeType: "docker-compose",
			composeFile: yaml(
				spec({
					models: { llm: { model: "ai/smollm2" } },
					services: { app: { image: "nginx:alpine", models: ["llm"] } },
				}),
			),
		});
		await expect(writeDeploy(withModels)).resolves.toContain("base64 -d");
		await expect(writeDeploy(compose())).resolves.toContain("base64 -d");
	});

	it("rejects default stack deploy when the final spec has models", async () => {
		const top = compose({
			composeFile: yaml(spec({ models: { llm: { model: "ai/smollm2" } } })),
		});
		const svc = compose({
			composeFile: yaml({
				services: { app: { image: "nginx:alpine", models: ["llm"] } },
			}),
		});
		const both = compose({
			composeFile: yaml({
				services: { app: { image: "nginx:alpine", models: ["llm"] } },
				models: { llm: { model: "ai/smollm2" } },
			}),
		});
		await expect(writeDeploy(top)).rejects.toThrow(STACK_COMPOSE_MODELS_ERROR);
		await expect(writeDeploy(svc)).rejects.toThrow(STACK_COMPOSE_MODELS_ERROR);
		await expect(writeDeploy(both)).rejects.toThrow(STACK_COMPOSE_MODELS_ERROR);
	});

	it("allows x-models and textual 'models:' that are not Compose models keys", async () => {
		await expect(
			writeDeploy(
				compose({
					composeFile: yaml(
						spec({ "x-models": { llm: { model: "ai/smollm2" } } }),
					),
				}),
			),
		).resolves.toContain("base64 -d");
		await expect(
			writeDeploy(
				compose({
					composeFile: `
services:
  app:
    image: nginx:alpine
    # models: fake
    environment:
      NOTE: "models: in env"
    labels:
      info: "models: in label"
    command: ["echo", "models: in command"]
`,
				}),
			),
		).resolves.toContain("base64 -d");
	});

	it("still converts stack compose with models for preview", async () => {
		const converted = await addDomainToCompose(
			compose({
				composeFile: yaml(spec({ models: { llm: { model: "ai/smollm2" } } })),
			}),
			[],
		);
		expect(converted?.models).toEqual({ llm: { model: "ai/smollm2" } });
	});

	it("inspects the transformed spec so randomization keeps models detectable", async () => {
		await expect(
			writeDeploy(
				compose({
					randomize: true,
					suffix: "abc123",
					composeFile: yaml(spec({ models: { llm: { model: "ai/smollm2" } } })),
				}),
			),
		).rejects.toThrow(STACK_COMPOSE_MODELS_ERROR);
		await expect(
			writeDeploy(
				compose({
					isolatedDeployment: true,
					suffix: "iso",
					composeFile: yaml({
						services: { app: { image: "nginx:alpine", models: ["llm"] } },
					}),
				}),
			),
		).rejects.toThrow(STACK_COMPOSE_MODELS_ERROR);
	});

	it("allows stack records whose custom command is compose up", async () => {
		await expect(
			writeDeploy(
				compose({
					command: "compose -p demo -f docker-compose.yml up -d",
					composeFile: yaml(spec({ models: { llm: { model: "ai/smollm2" } } })),
				}),
			),
		).resolves.toContain("base64 -d");
	});

	it("rejects docker-compose records whose custom command is stack deploy", async () => {
		const models = yaml(spec({ models: { llm: { model: "ai/smollm2" } } }));
		await expect(
			writeDeploy(
				compose({
					composeType: "docker-compose",
					command: "stack deploy -c docker-compose.yml demo",
					composeFile: models,
				}),
			),
		).rejects.toThrow(STACK_COMPOSE_MODELS_ERROR);
		await expect(
			writeDeploy(
				compose({
					composeType: "docker-compose",
					command: "  stack   deploy  -c docker-compose.yml demo",
					composeFile: models,
				}),
			),
		).rejects.toThrow(STACK_COMPOSE_MODELS_ERROR);
	});

	it("rejects custom stack up commands when models are present", async () => {
		const models = yaml(spec({ models: { llm: { model: "ai/smollm2" } } }));
		for (const command of [
			"stack up -c docker-compose.yml demo",
			"'stack' 'up' -c docker-compose.yml demo",
			"--context remote stack up -c docker-compose.yml demo",
			"--context=remote stack up -c docker-compose.yml demo",
			"-D stack up -c docker-compose.yml demo",
			"stack --orchestrator swarm up -c docker-compose.yml demo",
			"stack --orchestrator=swarm deploy -c docker-compose.yml demo",
		]) {
			await expect(
				writeDeploy(
					compose({
						composeType: "docker-compose",
						command,
						composeFile: models,
					}),
				),
			).rejects.toThrow(STACK_COMPOSE_MODELS_ERROR);
		}
	});

	it("allows compose commands that only resemble stack up", async () => {
		const models = yaml(spec({ models: { llm: { model: "ai/smollm2" } } }));
		for (const command of [
			"compose up",
			"compose run app stack up",
			"compose exec app stack up",
			"compose -f stack.yml up",
			"--context stack compose up",
		]) {
			await expect(
				writeDeploy(
					compose({
						composeType: "docker-compose",
						command,
						composeFile: models,
					}),
				),
			).resolves.toContain("base64 -d");
		}
	});

	it("does not treat a compose file token containing 'stack deploy' as stack deploy", async () => {
		await expect(
			writeDeploy(
				compose({
					composeType: "docker-compose",
					command: "compose -f my-stack deploy-file.yml up -d",
					composeFile: yaml(spec({ models: { llm: { model: "ai/smollm2" } } })),
				}),
			),
		).resolves.toContain("base64 -d");
	});

	it("rejects stack deploy after Docker root global options when models are present", async () => {
		const models = yaml(spec({ models: { llm: { model: "ai/smollm2" } } }));
		for (const command of [
			"--context remote stack deploy -c docker-compose.yml demo",
			"--context=remote stack deploy -c docker-compose.yml demo",
			"-c remote stack deploy -c docker-compose.yml demo",
			"-D stack deploy -c docker-compose.yml demo",
			"--tlsverify stack deploy -c docker-compose.yml demo",
			"--config /tmp/config stack deploy -c docker-compose.yml demo",
			"-H unix:///var/run/docker.sock stack deploy -c docker-compose.yml demo",
			"--context remote -D --tlsverify stack deploy -c docker-compose.yml demo",
		]) {
			await expect(
				writeDeploy(
					compose({
						composeType: "docker-compose",
						command,
						composeFile: models,
					}),
				),
			).rejects.toThrow(STACK_COMPOSE_MODELS_ERROR);
		}
	});

	it("rejects quoted stack deploy custom commands when models are present", async () => {
		const models = yaml(spec({ models: { llm: { model: "ai/smollm2" } } }));
		await expect(
			writeDeploy(
				compose({
					composeType: "docker-compose",
					command: "'stack' 'deploy' -c docker-compose.yml demo",
					composeFile: models,
				}),
			),
		).rejects.toThrow(STACK_COMPOSE_MODELS_ERROR);
		await expect(
			writeDeploy(
				compose({
					composeType: "docker-compose",
					command:
						'--config "/tmp/docker config" stack deploy -c docker-compose.yml demo',
					composeFile: models,
				}),
			),
		).rejects.toThrow(STACK_COMPOSE_MODELS_ERROR);
	});

	it("rejects later && docker stack deploy at sanitize time", () => {
		expect(() =>
			createCommand(
				compose({
					command: "compose up -d && docker stack deploy -c file.yml demo",
				}) as never,
			),
		).toThrow(/Chained commands must strictly start with 'docker compose '/);
		expect(() =>
			createCommand(
				compose({
					command:
						"compose up -d && docker --context remote stack deploy -c file.yml demo",
				}) as never,
			),
		).toThrow(/Chained commands must strictly start with 'docker compose '/);
	});

	it("allows compose commands that only resemble stack deploy after globals", async () => {
		const models = yaml(spec({ models: { llm: { model: "ai/smollm2" } } }));
		for (const command of [
			"--context remote compose up -d",
			"-D compose up -d",
			"compose run app stack deploy",
			"compose exec app stack deploy",
			"--context stack compose up -d",
		]) {
			await expect(
				writeDeploy(
					compose({
						composeType: "docker-compose",
						command,
						composeFile: models,
					}),
				),
			).resolves.toContain("base64 -d");
		}
	});
});

describe("compose-file patch order", () => {
	afterEach(() => {
		vi.restoreAllMocks();
		disk.yaml = yaml(spec());
	});

	const gitCompose = (overrides: Record<string, unknown> = {}) =>
		compose({
			sourceType: "github",
			composeId: "compose-1",
			composePath: "docker-compose.yml",
			...overrides,
		});

	it("rejects when a patch adds models to a stack deploy", async () => {
		disk.yaml = yaml(spec());
		vi.spyOn(db.query.patch, "findMany").mockResolvedValue([
			{
				enabled: true,
				type: "update",
				filePath: "docker-compose.yml",
				content: yaml(spec({ models: { llm: { model: "ai/smollm2" } } })),
			},
		] as never);
		await expect(writeDeploy(gitCompose())).rejects.toThrow(
			STACK_COMPOSE_MODELS_ERROR,
		);
	});

	it("allows stack deploy when a patch removes models", async () => {
		disk.yaml = yaml(spec({ models: { llm: { model: "ai/smollm2" } } }));
		vi.spyOn(db.query.patch, "findMany").mockResolvedValue([
			{
				enabled: true,
				type: "update",
				filePath: "docker-compose.yml",
				content: yaml(spec()),
			},
		] as never);
		await expect(writeDeploy(gitCompose())).resolves.toContain("base64 -d");
	});
});

describe("getBuildComposeCommand stack models", () => {
	const buildArgs = (overrides: Record<string, unknown> = {}) =>
		({
			...compose(overrides),
			type: "compose" as const,
		}) as unknown as Parameters<typeof getBuildComposeCommand>[0];

	it("does not emit stack deploy for default stack + models", async () => {
		await expect(
			getBuildComposeCommand(
				buildArgs({
					composeFile: yaml(spec({ models: { llm: { model: "ai/smollm2" } } })),
				}),
			),
		).rejects.toThrow(STACK_COMPOSE_MODELS_ERROR);
	});

	it("still emits stack deploy without models and compose up with models", async () => {
		const stack = await getBuildComposeCommand(buildArgs());
		expect(stack).toContain("stack deploy");
		expect(stack).not.toContain("docker network inspect");
		const up = await getBuildComposeCommand(
			buildArgs({
				composeType: "docker-compose",
				composeFile: yaml(spec({ models: { llm: { model: "ai/smollm2" } } })),
			}),
		);
		expect(up).toContain("compose -p demo");
		expect(up).toContain("up -d");
		expect(up).not.toContain("stack deploy");
	});

	it("does not create an isolated overlay network when stack + models is rejected", async () => {
		await expect(
			getBuildComposeCommand(
				buildArgs({
					isolatedDeployment: true,
					suffix: "iso",
					composeFile: yaml(spec({ models: { llm: { model: "ai/smollm2" } } })),
				}),
			),
		).rejects.toThrow(STACK_COMPOSE_MODELS_ERROR);
	});

	it("keeps a custom compose command for stack + models", async () => {
		const command = await getBuildComposeCommand(
			buildArgs({
				command: "compose -p demo -f docker-compose.yml up -d",
				composeFile: yaml(spec({ models: { llm: { model: "ai/smollm2" } } })),
			}),
		);
		expect(command).toContain("compose -p demo");
		expect(command).not.toContain("stack deploy");
	});

	it("does not emit stack deploy for a docker-compose record with a custom stack command and models", async () => {
		await expect(
			getBuildComposeCommand(
				buildArgs({
					composeType: "docker-compose",
					command: "stack deploy -c docker-compose.yml demo",
					composeFile: yaml(spec({ models: { llm: { model: "ai/smollm2" } } })),
				}),
			),
		).rejects.toThrow(STACK_COMPOSE_MODELS_ERROR);
	});

	it("does not emit stack deploy when global options precede stack deploy and models are present", async () => {
		await expect(
			getBuildComposeCommand(
				buildArgs({
					composeType: "docker-compose",
					command: "--context remote stack deploy -c docker-compose.yml demo",
					composeFile: yaml(spec({ models: { llm: { model: "ai/smollm2" } } })),
				}),
			),
		).rejects.toThrow(STACK_COMPOSE_MODELS_ERROR);
	});

	it("does not emit stack up when models are present", async () => {
		await expect(
			getBuildComposeCommand(
				buildArgs({
					composeType: "docker-compose",
					command: "stack up -c docker-compose.yml demo",
					composeFile: yaml(spec({ models: { llm: { model: "ai/smollm2" } } })),
				}),
			),
		).rejects.toThrow(STACK_COMPOSE_MODELS_ERROR);
		await expect(
			getBuildComposeCommand(
				buildArgs({
					composeType: "docker-compose",
					command: "--context remote stack up -c docker-compose.yml demo",
					composeFile: yaml(spec({ models: { llm: { model: "ai/smollm2" } } })),
				}),
			),
		).rejects.toThrow(STACK_COMPOSE_MODELS_ERROR);
	});
});

const fakeDockerArgv = (command: string, pathPrefix: string) => {
	const result = spawnSync("sh", ["-c", `docker ${command}`], {
		encoding: "utf8",
		env: { ...process.env, PATH: `${pathPrefix}:${process.env.PATH ?? ""}` },
	});
	if (result.status !== 0) {
		throw new Error(result.stderr || `fake docker failed: ${result.status}`);
	}
	return JSON.parse(result.stdout) as string[];
};

const argvLooksLikeStackDeploy = (argv: string[]) => {
	let i = 0;
	while (i < argv.length) {
		const token = argv[i];
		if (!token || token === "-" || !token.startsWith("-")) break;
		if (token === "--") {
			i += 1;
			break;
		}
		if (
			token === "-D" ||
			token === "-v" ||
			token === "-h" ||
			token.startsWith("--debug") ||
			token.startsWith("--tls") ||
			token.startsWith("--help") ||
			token.startsWith("--version")
		) {
			i += 1;
			continue;
		}
		if (
			token.startsWith("--context") ||
			token.startsWith("--config") ||
			token.startsWith("--host") ||
			token.startsWith("--log-level") ||
			token.startsWith("--tlscacert") ||
			token.startsWith("--tlscert") ||
			token.startsWith("--tlskey") ||
			token === "-c" ||
			token.startsWith("-c") ||
			token === "-H" ||
			token.startsWith("-H") ||
			token === "-l" ||
			token.startsWith("-l")
		) {
			if (token.includes("=") || (token.startsWith("-c") && token.length > 2)) {
				i += 1;
				continue;
			}
			i += 2;
			continue;
		}
		break;
	}
	return argv[i] === "stack" && argv[i + 1] === "deploy";
};

describe("fake-docker shell argv differential", () => {
	let fakePath = "";

	beforeAll(() => {
		fakePath = mkdtempSync(join(tmpdir(), "dokploy-fake-docker-"));
		const bin = join(fakePath, "docker");
		writeFileSync(
			bin,
			`#!/usr/bin/env node
process.stdout.write(JSON.stringify(process.argv.slice(2)));
`,
		);
		chmodSync(bin, 0o755);
	});

	afterAll(() => {
		if (fakePath) rmSync(fakePath, { recursive: true, force: true });
	});

	const corpus = [
		"stack deploy -c docker-compose.yml demo",
		"'stack' 'deploy' -c docker-compose.yml demo",
		"st\"ack\" de'ploy' -c docker-compose.yml demo",
		'--config "/tmp/docker config" stack deploy -c file.yml demo',
		"--config '/tmp/docker config' stack deploy -c file.yml demo",
		'--context "remote" stack deploy -c file.yml demo',
		"-c 'remote' stack deploy -c file.yml demo",
		"-D stack deploy -c file.yml demo",
		"--debug=false stack deploy -c file.yml demo",
		"--context=remote stack deploy -c file.yml demo",
		"-c remote stack deploy -c file.yml demo",
		"-H unix:///var/run/docker.sock stack deploy -c file.yml demo",
		"'compose' up",
		"compose run app 'stack' 'deploy'",
		"--context remote compose up",
		"-D compose up",
		"--debug false stack deploy --help",
		"-H stack deploy --help",
		"compose -f my-stack deploy-file.yml up",
		"stack\tdeploy -c file.yml demo",
		"  stack   deploy  -c file.yml demo",
	];

	it("agrees with /bin/sh argv for the supported custom-command corpus", () => {
		for (const command of corpus) {
			const argv = fakeDockerArgv(command, fakePath);
			expect(isStackDeployCommand(command), command).toBe(
				argvLooksLikeStackDeploy(argv),
			);
		}
	});

	it("classifies default createCommand stack deploy as stack deploy in generated-shell argv", () => {
		const command = createCommand(compose({ command: "" }) as never);
		expect(command.startsWith("stack deploy")).toBe(true);
		expect(isStackDeployCommand(command)).toBe(true);
		const argv = fakeDockerArgv(command, fakePath);
		expect(argv[0]).toBe("stack");
		expect(argv[1]).toBe("deploy");
	});

	it("expands quoted stack deploy to stack/deploy argv", () => {
		expect(
			fakeDockerArgv("'stack' 'deploy' -c file.yml demo", fakePath),
		).toEqual(["stack", "deploy", "-c", "file.yml", "demo"]);
		expect(fakeDockerArgv("'stack' 'up' -c file.yml demo", fakePath)).toEqual([
			"stack",
			"up",
			"-c",
			"file.yml",
			"demo",
		]);
		expect(
			fakeDockerArgv(
				'--config "/tmp/docker config" stack deploy -c file.yml demo',
				fakePath,
			),
		).toEqual([
			"--config",
			"/tmp/docker config",
			"stack",
			"deploy",
			"-c",
			"file.yml",
			"demo",
		]);
	});
});

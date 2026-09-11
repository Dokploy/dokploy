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
import { afterEach, describe, expect, it, vi } from "vitest";
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
});

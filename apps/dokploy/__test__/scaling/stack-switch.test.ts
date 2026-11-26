import type { ComposeSpecification } from "@dokploy/server";
import { db } from "@dokploy/server/db";
import { readComposeSnapshot } from "@dokploy/server/services/scaling/compose-snapshot";
import type { ScalableCompose } from "@dokploy/server/services/scaling/compose-status";
import {
	checkStackCompatibility,
	switchComposeToStack,
} from "@dokploy/server/services/scaling/stack-switch";
import { execAsync } from "@dokploy/server/utils/process/execAsync";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parse } from "yaml";

vi.mock(
	"@dokploy/server/services/scaling/compose-snapshot",
	async (importActual) => ({
		...(await importActual<
			typeof import("@dokploy/server/services/scaling/compose-snapshot")
		>()),
		readComposeSnapshot: vi.fn(),
	}),
);

vi.mock("@dokploy/server/utils/process/execAsync", async (importActual) => ({
	...(await importActual<
		typeof import("@dokploy/server/utils/process/execAsync")
	>()),
	execAsync: vi.fn(async () => ({ stdout: "", stderr: "" })),
	execAsyncRemote: vi.fn(async () => ({ stdout: "", stderr: "" })),
}));

const spec = (yaml: string) => parse(yaml) as ComposeSpecification;

describe("checkStackCompatibility", () => {
	it("blocks what Swarm cannot run and lists what it ignores", () => {
		const issues = checkStackCompatibility(
			spec(`
services:
  built:
    build: .
  pushed:
    build: .
    image: ghcr.io/acme/api:1
  host:
    image: a
    network_mode: host
  legacy:
    image: a
    container_name: legacy
    restart: always
    depends_on: [db]
    links: [db]
    ports: ["8080:80"]
    volumes: ["./conf:/etc/conf", "data:/data"]
  clean:
    image: nginx
`),
		);
		const by = (service: string) =>
			issues.filter((issue) => issue.serviceName === service);

		expect(by("built").map((issue) => issue.severity)).toEqual(["blocking"]);
		expect(by("pushed").map((issue) => issue.severity)).toEqual(["warning"]);
		expect(by("host")[0]).toMatchObject({ severity: "blocking" });
		expect(by("legacy")).toHaveLength(7);
		expect(by("legacy").every((issue) => issue.severity === "warning")).toBe(
			true,
		);
		expect(by("clean")).toEqual([]);
	});
});

const compose = (overrides: Partial<ScalableCompose> = {}) =>
	({
		composeId: "c1",
		appName: "shop",
		serverId: null,
		sourceType: "raw",
		composePath: "docker-compose.yml",
		composeType: "docker-compose",
		createEnvFile: true,
		command: "",
		composeStatus: "done",
		server: null,
		composeFile: "services:\n  web:\n    image: nginx\n",
		...overrides,
	}) as ScalableCompose & { isolatedDeployment?: boolean };

describe("switchComposeToStack", () => {
	beforeEach(() => {
		vi.mocked(execAsync).mockClear();
		vi.mocked(readComposeSnapshot).mockReset().mockResolvedValue(null);
		vi.mocked(db.update).mockClear();
	});

	it("takes the project down, keeps volumes and changes the type", async () => {
		const result = await switchComposeToStack({
			compose: compose({ isolatedDeployment: true } as never),
			acknowledgeWarnings: false,
		});

		expect(result.issues).toEqual([]);
		const commands = vi
			.mocked(execAsync)
			.mock.calls.map(([command]) => command);
		expect(commands[0]).toContain(
			"docker compose -p shop down --remove-orphans",
		);
		expect(commands[0]).not.toContain("--volumes");
		expect(commands[1]).toContain("docker network rm shop");
		expect(db.update).toHaveBeenCalled();
	});

	it("refuses blocking issues, and warnings until confirmed", async () => {
		await expect(
			switchComposeToStack({
				compose: compose({ composeFile: "services:\n  api:\n    build: .\n" }),
				acknowledgeWarnings: true,
			}),
		).rejects.toMatchObject({ reason: "incompatible" });

		const withWarning = compose({
			composeFile: "services:\n  api:\n    image: a\n    restart: always\n",
		});
		await expect(
			switchComposeToStack({
				compose: withWarning,
				acknowledgeWarnings: false,
			}),
		).rejects.toMatchObject({ reason: "confirmation_required" });
		expect(execAsync).not.toHaveBeenCalled();

		await switchComposeToStack({
			compose: withWarning,
			acknowledgeWarnings: true,
		});
		expect(execAsync).toHaveBeenCalled();
	});

	it("refuses stacks, custom commands and running deployments", async () => {
		await expect(
			switchComposeToStack({
				compose: compose({ composeType: "stack" }),
				acknowledgeWarnings: true,
			}),
		).rejects.toMatchObject({ reason: "unsupported_mode" });
		await expect(
			switchComposeToStack({
				compose: compose({ command: "compose up -d" }),
				acknowledgeWarnings: true,
			}),
		).rejects.toMatchObject({ reason: "custom_command" });
		await expect(
			switchComposeToStack({
				compose: compose({ composeStatus: "running" }),
				acknowledgeWarnings: true,
			}),
		).rejects.toMatchObject({ reason: "deployment_in_progress" });
	});
});

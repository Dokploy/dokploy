import { getBuildComposeCommand } from "@dokploy/server/utils/builders/compose";
import { describe, expect, it, vi } from "vitest";

// Isolate the command builder from the compose-file I/O performed by
// writeDomainsToCompose; we only care about the docker invocation it emits.
vi.mock("@dokploy/server/utils/docker/domain", () => ({
	writeDomainsToCompose: vi.fn().mockResolvedValue(""),
}));

const baseCompose = {
	appName: "my-app",
	sourceType: "raw",
	command: "",
	composePath: "docker-compose.yml",
	composeType: "stack",
	isolatedDeployment: false,
	randomize: false,
	suffix: "",
	serverId: null,
	env: "",
	mounts: [],
	domains: [],
	environment: { project: { env: "" }, env: "" },
} as unknown as Parameters<typeof getBuildComposeCommand>[0];

// Regression coverage for #4401: the deploy command runs under `env -i`, which
// clears the environment except for the vars listed explicitly. HOME must be
// preserved so docker can resolve ~/.docker/config.json — otherwise
// `docker stack deploy --with-registry-auth` ships no credentials to the swarm
// and private-registry images fail to pull.
describe("getBuildComposeCommand registry auth (#4401)", () => {
	it("preserves HOME for swarm stack deploys", async () => {
		const command = await getBuildComposeCommand({
			...baseCompose,
			composeType: "stack",
		});

		expect(command).toContain("stack deploy");
		expect(command).toContain("--with-registry-auth");
		expect(command).toContain('env -i PATH="$PATH" HOME="$HOME"');
	});

	it("preserves HOME for docker compose deploys", async () => {
		const command = await getBuildComposeCommand({
			...baseCompose,
			composeType: "docker-compose",
		});

		expect(command).toContain("compose -p my-app");
		expect(command).toContain('env -i PATH="$PATH" HOME="$HOME"');
	});
});

describe("getBuildComposeCommand command boundary", () => {
	it("quotes compose file paths when building standard compose commands", async () => {
		const command = await getBuildComposeCommand({
			...baseCompose,
			sourceType: "github",
			composeType: "docker-compose",
			composePath: "deploy/docker compose.yml",
		});

		expect(command).toContain(
			"compose -p my-app -f 'deploy/docker compose.yml' up -d --build --remove-orphans",
		);
		expect(command).toMatch(/base64 -d > .*deploy\/\.env;/);
		expect(command).not.toContain("-f deploy/docker compose.yml up");
	});

	it("rejects unsafe compose file paths before building compose commands", async () => {
		await expect(
			getBuildComposeCommand({
				...baseCompose,
				sourceType: "github",
				composeType: "docker-compose",
				composePath: "deploy/docker compose.yml; touch /tmp/pwn",
			}),
		).rejects.toThrow("Invalid file path");
	});

	it("preserves quoted custom compose command arguments as argv", async () => {
		const command = await getBuildComposeCommand({
			...baseCompose,
			command: 'compose -p my-app -f "docker compose.yml" up -d',
		});

		expect(command).toContain(
			"docker compose -p my-app -f 'docker compose.yml' up -d",
		);
		expect(command).not.toContain(
			"docker compose -p my-app -f docker compose.yml up -d",
		);
	});

	it.each([
		["semicolon", "compose -f docker-compose.yml up; touch /tmp/pwn"],
		["and operator", "compose -f docker-compose.yml up && touch /tmp/pwn"],
		["pipe", "compose -f docker-compose.yml up | cat"],
		["command substitution", "compose -f docker-compose.yml up $(id)"],
		["backticks", "compose -f docker-compose.yml up `id`"],
		["redirect", "compose -f docker-compose.yml up > /tmp/out"],
		["parens", "compose -f docker-compose.yml up (id)"],
		["newline", "compose -f docker-compose.yml up\ntouch /tmp/pwn"],
		["docker prefix", "docker compose up"],
		["unsupported docker subcommand", "build -t image ."],
		["missing compose project", "compose -f docker-compose.yml up -d"],
		["foreign compose project", "compose -p other up -d"],
		["foreign long compose project", "compose --project-name other up -d"],
		["foreign inline compose project", "compose --project-name=other up -d"],
		["missing stack name", "stack deploy -c docker-compose.yml"],
		["foreign stack name", "stack deploy -c docker-compose.yml other"],
		["unsupported stack subcommand", "stack rm my-app"],
	])(
		"rejects custom compose commands containing %s",
		async (_, customCommand) => {
			await expect(
				getBuildComposeCommand({
					...baseCompose,
					command: customCommand,
				}),
			).rejects.toThrow("Invalid docker compose command");
		},
	);

	it.each([
		[
			"compose short project",
			"compose -p my-app up -d",
			"compose -p my-app up -d",
		],
		[
			"compose long project",
			"compose --project-name my-app up -d",
			"compose --project-name my-app up -d",
		],
		[
			"compose inline project",
			"compose --project-name=my-app up -d",
			"compose --project-name\\=my-app up -d",
		],
		[
			"stack deploy",
			"stack deploy -c docker-compose.yml my-app",
			"stack deploy -c docker-compose.yml my-app",
		],
	])(
		"allows custom docker commands bound to %s",
		async (_, customCommand, expectedCommand) => {
			const command = await getBuildComposeCommand({
				...baseCompose,
				command: customCommand,
			});

			expect(command).toContain(`docker ${expectedCommand}`);
		},
	);
});

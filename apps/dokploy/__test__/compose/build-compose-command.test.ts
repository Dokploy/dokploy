import { getBuildComposeCommand } from "@dokploy/server/utils/builders/compose";
import { describe, expect, it, vi } from "vitest";

vi.mock("@dokploy/server/utils/docker/domain", () => ({
	writeDomainsToCompose: vi.fn().mockResolvedValue(""),
}));

vi.mock("@dokploy/server/services/registry", () => ({
	safeDockerLoginCommand: vi.fn().mockReturnValue('echo "docker login stub"'),
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
	buildServerId: null,
	buildRegistryId: null,
	env: "",
	mounts: [],
	domains: [],
	environment: { project: { env: "" }, env: "" },
} as unknown as Parameters<typeof getBuildComposeCommand>[0];

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

	it("logs in and pulls only the prebuilt services", async () => {
		const command = await getBuildComposeCommand(
			{ ...baseCompose, composeType: "docker-compose" },
			{
				prebuilt: {
					registry: {} as never,
					images: { api: "registry.example.com/myorg/my-app-api:abc" },
				},
			},
		);

		expect(command).toContain("docker login stub");
		expect(command).toContain(
			'env -i PATH="$PATH" HOME="$HOME" docker compose -p my-app -f docker-compose.yml pull api',
		);
		expect(command).toContain("up -d --no-build --remove-orphans");
	});

	it("skips login and pull when nothing was prebuilt", async () => {
		const command = await getBuildComposeCommand(
			{ ...baseCompose, composeType: "docker-compose" },
			{ prebuilt: { registry: {} as never, images: {} } },
		);

		expect(command).not.toContain("docker login stub");
		expect(command).not.toContain(" pull ");
	});
});

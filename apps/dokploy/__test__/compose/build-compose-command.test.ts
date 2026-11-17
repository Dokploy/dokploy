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

describe("getBuildComposeCommand bake entitlements (#5842)", () => {
	it("lets buildx read a Dockerfile from the files dir when mounts exist", async () => {
		const command = await getBuildComposeCommand({
			...baseCompose,
			composeType: "docker-compose",
			mounts: [{ type: "file" }],
		} as any);

		expect(command).toContain(
			'HOME="$HOME" BUILDX_BAKE_ENTITLEMENTS_FS=0  docker compose',
		);
	});

	it("keeps the entitlement check when there are no mounts", async () => {
		const command = await getBuildComposeCommand({
			...baseCompose,
			composeType: "docker-compose",
		});

		expect(command).not.toContain("BUILDX_BAKE_ENTITLEMENTS_FS");
	});

	it("does not set it for swarm stacks", async () => {
		const command = await getBuildComposeCommand({
			...baseCompose,
			composeType: "stack",
			mounts: [{ type: "file" }],
		} as any);

		expect(command).not.toContain("BUILDX_BAKE_ENTITLEMENTS_FS");
	});
});

import { getBuildComposeCommand } from "@dokploy/server/utils/builders/compose";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Compose now has a `createEnvFile` toggle (default true), mirroring the
// Application builder's flag: when disabled, Dokploy never writes `.env`,
// so a repo-tracked file survives untouched.
vi.mock("@dokploy/server/utils/docker/domain", () => ({
	writeDomainsToCompose: vi.fn().mockResolvedValue(""),
}));

const baseCompose = {
	appName: "env-file-toggle",
	sourceType: "raw",
	command: "",
	composePath: "docker-compose.yml",
	composeType: "docker-compose",
	isolatedDeployment: false,
	randomize: false,
	suffix: "",
	serverId: null,
	env: "FOO=bar",
	mounts: [],
	domains: [],
	environment: { project: { env: "" }, env: "" },
} as unknown as Parameters<typeof getBuildComposeCommand>[0];
const staging = {
	stage: vi.fn().mockResolvedValue("/staged/env"),
	cleanup: vi.fn(),
};
beforeEach(() => vi.clearAllMocks());

describe("getBuildComposeCommand createEnvFile toggle", () => {
	it("createEnvFile: false never writes the .env file", async () => {
		const command = await getBuildComposeCommand(
			{
				...baseCompose,
				createEnvFile: false,
			},
			staging,
		);

		expect(command).not.toContain("base64 -d >");
		expect(staging.stage).not.toHaveBeenCalled();
	});

	it("createEnvFile: true (default) writes Dokploy's vars", async () => {
		const command = await getBuildComposeCommand(
			{
				...baseCompose,
				createEnvFile: true,
			},
			staging,
		);

		expect(command).toContain("cat /staged/env >");
		expect(staging.stage).toHaveBeenCalledWith(
			expect.stringContaining('FOO="bar"'),
		);
	});
});

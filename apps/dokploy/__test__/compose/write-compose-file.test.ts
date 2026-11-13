import { writeFileSync } from "node:fs";
import {
	getComposePath,
	writeDomainsToCompose,
} from "@dokploy/server/utils/docker/domain";
import { writeFileRemote } from "@dokploy/server/utils/process/execAsync";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:fs")>();
	return { ...actual, writeFileSync: vi.fn() };
});

vi.mock("@dokploy/server/utils/process/execAsync", async (importOriginal) => {
	const actual =
		await importOriginal<
			typeof import("@dokploy/server/utils/process/execAsync")
		>();
	return { ...actual, writeFileRemote: vi.fn().mockResolvedValue(undefined) };
});

// The shape from #5941: one anchor with many variables merged into many
// services. Resolving the merge keys copies the whole mapping into each one.
const mergeKeyCompose = () => {
	const vars = Array.from(
		{ length: 150 },
		(_, i) =>
			`      SETTING_${i}: \${SETTING_${i}:-some-default-value-for-this-setting}`,
	).join("\n");
	const services = Array.from(
		{ length: 13 },
		(_, i) => `  svc${i}:\n    <<: *backend\n    command: ["run", "svc${i}"]`,
	).join("\n");
	return `x-backend: &backend\n  image: example/backend:latest\n  restart: unless-stopped\n  environment:\n${vars}\nservices:\n${services}\n`;
};

const baseCompose = {
	appName: "my-app",
	serverId: null,
	composeType: "docker-compose",
	sourceType: "raw",
	composePath: "docker-compose.yml",
	isolatedDeployment: false,
	randomize: false,
	suffix: "",
	composeFile: mergeKeyCompose(),
} as any;

const ARG_MAX_PER_STRING = 128 * 1024;

describe("writeDomainsToCompose with a compose that expands past 128 KiB (#5941)", () => {
	beforeEach(() => {
		vi.mocked(writeFileSync).mockClear();
		vi.mocked(writeFileRemote).mockClear();
	});

	it("writes the file itself and keeps it out of the deploy script", async () => {
		const command = await writeDomainsToCompose(baseCompose, []);

		expect(writeFileSync).toHaveBeenCalledTimes(1);
		const [path, content] = vi.mocked(writeFileSync).mock.calls[0]!;
		expect(path).toBe(getComposePath(baseCompose));
		expect(String(content).length).toBeGreaterThan(ARG_MAX_PER_STRING);
		expect(String(content)).toContain("svc12:");
		expect(command.length).toBeLessThan(1024);
		expect(command).not.toContain("base64");
	});

	it("writes over SFTP for a remote server", async () => {
		const remote = { ...baseCompose, serverId: "server-1" };
		const command = await writeDomainsToCompose(remote, []);

		expect(writeFileSync).not.toHaveBeenCalled();
		expect(writeFileRemote).toHaveBeenCalledWith(
			"server-1",
			getComposePath(remote),
			expect.stringContaining("svc12:"),
		);
		expect(command).not.toContain("base64");
	});

	it("stops the deploy with the error when the write fails", async () => {
		vi.mocked(writeFileRemote).mockRejectedValueOnce(
			new Error("Failed to write remote file"),
		);
		const command = await writeDomainsToCompose(
			{ ...baseCompose, serverId: "server-1" },
			[],
		);

		expect(command).toContain("Failed to write remote file");
		expect(command).toContain("exit 1");
	});
});

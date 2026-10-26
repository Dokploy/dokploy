import { createRequire } from "node:module";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const { getRemoteDockerMock } = vi.hoisted(() => ({
	getRemoteDockerMock: vi.fn(),
}));
vi.mock("@dokploy/server/utils/servers/remote-docker", () => ({
	getRemoteDocker: getRemoteDockerMock,
}));

const { readContainerFileTail } = await import(
	"@dokploy/server/services/container-file-tail"
);

// Opt in with DOKPLOY_DOCKER_INTEGRATION=1. This creates and removes only its
// own temporary container, using an already available node:24-alpine image.
describe.skipIf(process.env.DOKPLOY_DOCKER_INTEGRATION !== "1")(
	"container file tail against Docker",
	() => {
		const Docker = createRequire(import.meta.url)("dockerode");
		const docker = new Docker({
			socketPath:
				process.env.DOKPLOY_TEST_DOCKER_SOCKET ||
				(process.platform === "win32"
					? "//./pipe/dockerDesktopLinuxEngine"
					: "/var/run/docker.sock"),
		});
		let container: ReturnType<typeof docker.getContainer>;
		const command = async (cmd: string[]) => {
			const execution = await container.exec({
				Cmd: cmd,
				AttachStdout: true,
				AttachStderr: true,
			});
			const stream = await execution.start({});
			await new Promise<void>((resolve, reject) => {
				stream.once("end", resolve);
				stream.once("error", reject);
				stream.resume();
			});
			expect((await execution.inspect()).ExitCode).toBe(0);
		};

		beforeAll(async () => {
			getRemoteDockerMock.mockResolvedValue(docker);
			container = await docker.createContainer({
				Image: "node:24-alpine",
				Cmd: ["sleep", "300"],
				Labels: { "dokploy.test": "container-file-tail" },
			});
			await container.start();
			await command([
				"node",
				"-e",
				`const fs = require('fs'); fs.writeFileSync('/tmp/log', 'history\\n'.repeat(100000) + 'LATEST_ERROR_MARKER\\n'); fs.writeFileSync('/tmp/huge', 'x'.repeat(2 * 1024 * 1024) + 'LATEST_ERROR_MARKER'); fs.writeFileSync("/tmp/a 'quoted' $log.txt", 'one\\n中🚀\\n'); fs.symlinkSync('/tmp/log', '/tmp/link');`,
			]);
			await command(["mkfifo", "/tmp/blocked"]);
		}, 20000);

		afterAll(async () => {
			if (container) await container.remove({ force: true });
		});

		it("returns the latest marker from a log larger than the editor limit", async () => {
			const result = await readContainerFileTail(container.id, "/tmp/log", 1);
			expect(result.content).toBe("LATEST_ERROR_MARKER\n");
			expect(result.truncatedByBytes).toBe(true);
			expect(result.truncatedByLines).toBe(true);
		});

		it("bounds enormous lines and keeps the newest bytes", async () => {
			const result = await readContainerFileTail(
				container.id,
				"/tmp/huge",
				200,
				1024,
			);
			expect(Buffer.byteLength(result.content)).toBe(1024);
			expect(result.content.endsWith("LATEST_ERROR_MARKER")).toBe(true);
			expect(result.truncatedByBytes).toBe(true);
		});

		it("preserves Unicode and literal unusual filenames", async () => {
			const result = await readContainerFileTail(
				container.id,
				"/tmp/a 'quoted' $log.txt",
				1,
			);
			expect(result.content).toBe("中🚀\n");
		});

		it.each(["/tmp/blocked", "/tmp/link", "/tmp"])(
			"rejects special paths without launching a blocking read: %s",
			async (path) => {
				await expect(
					readContainerFileTail(container.id, path),
				).rejects.toMatchObject({ code: "NOT_A_FILE" });
			},
		);

		it("reports a missing file rather than returning empty success", async () => {
			await expect(
				readContainerFileTail(container.id, "/tmp/missing"),
			).rejects.toMatchObject({ code: "FILE_UNAVAILABLE" });
		});

		it("fails clearly when Docker cannot inspect a mounted device", async () => {
			await expect(
				readContainerFileTail(container.id, "/dev/null"),
			).rejects.toMatchObject({ code: "FILE_UNAVAILABLE" });
		});
	},
);

import { execFile } from "node:child_process";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";

vi.mock("@dokploy/server", () => ({
	IS_CLOUD: false,
	findServerById: vi.fn(),
	validateRequest: vi.fn(async () => ({
		user: { id: "user-1" },
		session: { activeOrganizationId: "org-1" },
	})),
}));
vi.mock("@/server/wss/authorize", () => ({
	canAccessDockerOverWss: vi.fn(async () => true),
}));

const { setupDockerContainerLogsWebSocketServer } = await import(
	"@/server/wss/docker-container-logs"
);

const run = promisify(execFile);

/**
 * Opens the real log viewer WebSocket against a throwaway container and checks
 * that viewing (and closing) the logs never signals the container. Before the
 * fix, every viewer ran `docker attach` with signal proxying, so tearing the
 * viewer down forwarded SIGHUP to the container's main process; a service that
 * exits on SIGHUP (PocketBase, for one) restarted.
 *
 * Needs a local Docker daemon. Set DOKPLOY_DOCKER_REAL_TESTS=1 to run; the
 * suite starts and removes its own `alpine` containers. Skipped otherwise.
 */
describe.skipIf(!process.env.DOKPLOY_DOCKER_REAL_TESTS)(
	"docker container logs WebSocket against a real container",
	() => {
		const name = `dokploy-logs-signal-test-${process.pid}`;
		const ttyName = `dokploy-logs-signal-test-tty-${process.pid}`;
		// PID 1 records any signal it receives instead of dying, and echoes stdin.
		const script = [
			'for s in HUP INT TERM QUIT; do trap "echo SIGNAL:$s" $s; done',
			"echo ready",
			'while true; do if read -t 1 line; then echo "got:$line"; fi; done',
		].join("; ");
		let server: http.Server;
		let port: number;

		const containerLogs = async (container = name) => {
			const { stdout, stderr } = await run("docker", ["logs", container]);
			return stdout + stderr;
		};
		const inspect = async (container: string, format: string) =>
			(await run("docker", ["inspect", "-f", format, container])).stdout.trim();
		const isRunning = async (container = name) =>
			(await inspect(container, "{{.State.Running}}")) === "true";
		const startedAt = (container = name) =>
			inspect(container, "{{.State.StartedAt}}");

		const waitFor = async (check: () => boolean | Promise<boolean>) => {
			const deadline = Date.now() + 15_000;
			while (!(await check())) {
				if (Date.now() > deadline) throw new Error("timed out");
				await new Promise((resolve) => setTimeout(resolve, 100));
			}
		};

		const openViewer = async (container = name) => {
			const messages: string[] = [];
			const ws = new WebSocket(
				`ws://127.0.0.1:${port}/docker-container-logs?containerId=${container}&tail=100&since=all`,
			);
			ws.on("message", (data) => messages.push(data.toString()));
			await waitFor(() => messages.join("").includes("ready"));
			return { ws, messages };
		};

		const closeViewer = async (ws: WebSocket) => {
			ws.close();
			await waitFor(() => ws.readyState === WebSocket.CLOSED);
			// Teardown kills the viewer's processes; give a forwarded signal time
			// to reach the container and its trap time to run.
			await new Promise((resolve) => setTimeout(resolve, 3000));
		};

		// Host pids of the `docker attach` clients the viewer spawned for a container.
		const attachPids = async (container: string) => {
			const { stdout } = await run("pgrep", [
				"-f",
				`docker attach --sig-proxy=false ${container}`,
			]).catch(() => ({ stdout: "" }));
			return stdout.split("\n").filter(Boolean).map(Number);
		};

		beforeAll(async () => {
			await run("docker", ["rm", "-f", name, ttyName]).catch(() => {});
			await run("docker", [
				"run",
				"-d",
				"-i",
				"--name",
				name,
				"alpine:3",
				"sh",
				"-c",
				script,
			]);
			await run("docker", [
				"run",
				"-d",
				"-i",
				"-t",
				"--name",
				ttyName,
				"alpine:3",
				"sh",
				"-c",
				script,
			]);
			await waitFor(async () => (await containerLogs()).includes("ready"));
			await waitFor(async () =>
				(await containerLogs(ttyName)).includes("ready"),
			);

			server = http.createServer();
			setupDockerContainerLogsWebSocketServer(server);
			await new Promise<void>((resolve) =>
				server.listen(0, "127.0.0.1", resolve),
			);
			port = (server.address() as AddressInfo).port;
		}, 120_000);

		afterAll(async () => {
			await run("docker", ["rm", "-f", name, ttyName]).catch(() => {});
			await new Promise((resolve) => server?.close(resolve));
		});

		it("does not signal the container when a viewer opens and closes", async () => {
			for (let i = 0; i < 3; i++) {
				const { ws } = await openViewer();
				await closeViewer(ws);
			}

			expect(await containerLogs()).not.toContain("SIGNAL:");
			expect(await isRunning()).toBe(true);
		}, 60_000);

		it("still sends commands to the container, without signaling it on close", async () => {
			const { ws, messages } = await openViewer();
			ws.send("hello-from-viewer");
			await waitFor(() => messages.join("").includes("got:hello-from-viewer"));
			await closeViewer(ws);

			expect(await containerLogs()).not.toContain("SIGNAL:");
			expect(await isRunning()).toBe(true);
		}, 60_000);

		it("does not signal or restart a TTY container when a viewer opens, sends input and closes", async () => {
			const started = await startedAt(ttyName);

			for (let i = 0; i < 3; i++) {
				const { ws, messages } = await openViewer(ttyName);
				ws.send(`hello-tty-${i}`);
				await waitFor(() => messages.join("").includes(`got:hello-tty-${i}`));
				await closeViewer(ws);
			}

			expect(await containerLogs(ttyName)).not.toContain("SIGNAL:");
			expect(await isRunning(ttyName)).toBe(true);
			expect(await startedAt(ttyName)).toBe(started);
		}, 60_000);

		it("spawns a new attach for input after the previous attach exited", async () => {
			const started = await startedAt();
			const { ws, messages } = await openViewer();
			ws.send("first-input");
			await waitFor(() => messages.join("").includes("got:first-input"));

			// The attach client dies while the viewer stays connected, as when the
			// container's attach stream drops or a detach sequence is typed.
			await waitFor(async () => (await attachPids(name)).length > 0);
			for (const pid of await attachPids(name)) process.kill(pid, "SIGKILL");
			await waitFor(async () => (await attachPids(name)).length === 0);
			// Let the viewer observe the exit.
			await new Promise((resolve) => setTimeout(resolve, 500));

			ws.send("second-input");
			await waitFor(() => messages.join("").includes("got:second-input"));
			await closeViewer(ws);

			expect(await containerLogs()).not.toContain("SIGNAL:");
			expect(await isRunning()).toBe(true);
			expect(await startedAt()).toBe(started);
		}, 60_000);
	},
);

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
	const { EventEmitter } = require("node:events") as {
		EventEmitter: typeof import("node:events").EventEmitter;
	};

	class FakeStream extends EventEmitter {
		stderr: InstanceType<typeof EventEmitter>;
		constructor() {
			super();
			this.stderr = new EventEmitter();
		}
	}

	let capturedCommand = "";
	// Per-test configuration of the remote script's behavior. The fake ssh2
	// Client replays these when its exec() is invoked, so each test drives the
	// real production defaultCommand(...) string through installRequirements
	// with a chosen exit outcome.
	let exitCode: number | null = 0;
	let stderrChunk: string | null = null;
	let stdoutChunk: string | null = null;

	class FakeClient extends EventEmitter {
		connect(_opts: unknown) {
			process.nextTick(() => this.emit("ready"));
		}
		exec(cmd: string, cb: (err: Error | null, stream: unknown) => void) {
			capturedCommand = cmd;
			const stream = new FakeStream();
			cb(null, stream);
			process.nextTick(() => {
				if (stdoutChunk) stream.emit("data", Buffer.from(stdoutChunk));
				if (stderrChunk) stream.stderr.emit("data", Buffer.from(stderrChunk));
				// ssh2 emits the remote exit code as the first arg of "close"
				// (see ssh2 utils.js: channel.emit('close', exit.code)). A null
				// code means the process was killed by a signal.
				stream.emit("close", exitCode);
			});
		}
		end() {}
	}

	return {
		FakeClient,
		getCapturedCommand: () => capturedCommand,
		configure: (opts: {
			exitCode?: number | null;
			stderr?: string | null;
			stdout?: string | null;
		}) => {
			// `?? 0` would coerce an explicit `null` (signal-kill) back to 0;
			// only fall back to 0 when the option is omitted entirely.
			exitCode = opts.exitCode !== undefined ? opts.exitCode : 0;
			stderrChunk = opts.stderr ?? null;
			stdoutChunk = opts.stdout ?? null;
		},
		findServerById: vi.fn(async () => ({
			serverId: "srv-1",
			name: "my-server",
			serverType: "deploy",
			sshKeyId: "key-1",
			ipAddress: "1.2.3.4",
			port: 22,
			username: "root",
			sshKey: { privateKey: "PK" },
			metricsConfig: {
				server: { token: "", urlCallback: "", cronJob: "" },
				containers: {},
			},
			// No `command` override -> installRequirements uses defaultCommand(...),
			// exactly as in production when the operator has not customized the
			// script.
			command: "",
		})),
		updateServerById: vi.fn(async () => ({})),
		createServerDeployment: vi.fn(async () => ({ deploymentId: "dep-1" })),
		updateDeploymentStatus: vi.fn<
			(deploymentId: string, status: string) => Promise<unknown>
		>(async () => ({})),
	};
});

vi.mock("@dokploy/server/services/server", () => ({
	findServerById: mocks.findServerById,
	updateServerById: mocks.updateServerById,
}));
vi.mock("@dokploy/server/services/deployment", () => ({
	createServerDeployment: mocks.createServerDeployment,
	updateDeploymentStatus: mocks.updateDeploymentStatus,
}));
vi.mock("@dokploy/server/services/admin", () => ({
	getDokployUrl: vi.fn(async () => "http://dokploy.example"),
}));
vi.mock("@dokploy/server/constants", async () => {
	const actual = await import("@dokploy/server/constants");
	return {
		...actual,
		IS_CLOUD: false,
		paths: () => ({
			LOGS_PATH: "/tmp/dokploy-logs",
			SSH_PATH: "/etc/dokploy/ssh",
		}),
	};
});
vi.mock("@dokploy/server/utils/filesystem/directory", () => ({
	recreateDirectory: vi.fn(async () => ({})),
}));
vi.mock("@dokploy/server/setup/monitoring-setup", () => ({
	setupMonitoring: vi.fn(async () => ({})),
}));
vi.mock("ssh2", () => ({ Client: mocks.FakeClient }));

import { serverSetup } from "@dokploy/server/setup/server-setup";

describe("serverSetup exit-code propagation", () => {
	beforeEach(() => {
		mocks.updateDeploymentStatus.mockClear();
		mocks.createServerDeployment.mockClear();
		mocks.updateServerById.mockClear();
		mocks.findServerById.mockClear();
		mocks.configure({ exitCode: 0, stderr: null, stdout: null });
	});

	it("marks the deployment as 'error' when the remote setup script exits non-zero", async () => {
		mocks.configure({
			exitCode: 1,
			stderr: "Error: Non-root user requires passwordless sudo access. ❌",
		});

		await serverSetup("srv-1", () => {});

		// Prove the test exercised the real production script, not a stub:
		// defaultCommand(...) always begins with `set -e` and contains the
		// passwordless-sudo guard.
		const cmd = mocks.getCapturedCommand();
		expect(cmd).toContain("set -e");
		expect(cmd).toContain("sudo -n true");

		const statuses = mocks.updateDeploymentStatus.mock.calls.map((c) => c[1]);
		expect(statuses).toContain("error");
		expect(statuses).not.toContain("done");
	});

	it("marks the deployment as 'done' and streams the success banner when the remote setup script exits zero", async () => {
		mocks.configure({
			exitCode: 0,
			stdout: "Setup completed successfully ✅",
		});

		const streamed: string[] = [];
		await serverSetup("srv-1", (data) => streamed.push(String(data)));

		const statuses = mocks.updateDeploymentStatus.mock.calls.map((c) => c[1]);
		expect(statuses).toContain("done");
		expect(statuses).not.toContain("error");

		// The success banner is only emitted on the resolve path.
		expect(streamed.join("")).toContain("Setup Server: ✅");
	});

	it("marks the deployment as 'error' when the remote process is killed by a signal (exit code null)", async () => {
		// ssh2 emits `null` for the exit code when the remote process was
		// terminated by a signal (e.g. OOM). A signal-killed setup leaves the
		// server half-installed and must not be reported as success.
		mocks.configure({ exitCode: null });

		await serverSetup("srv-1", () => {});

		const statuses = mocks.updateDeploymentStatus.mock.calls.map((c) => c[1]);
		expect(statuses).toContain("error");
		expect(statuses).not.toContain("done");
	});
});

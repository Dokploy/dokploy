import { EventEmitter } from "node:events";
import { execAsyncRemote } from "@dokploy/server/utils/process/execAsync";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Define the `findServerById` mock via `vi.hoisted` so it is available to the
// `vi.mock` factory *and* carries the vitest `Mock` type in test code. Defining
// it inline in a plain `vi.mock` factory would leave the imported binding typed
// as the real function, hiding `.mockResolvedValue`/`.mockReset` from TS.
const mocks = vi.hoisted(() => ({
	findServerById: vi.fn(),
}));

// The most recently constructed FakeClient is published here so tests can drive
// its EventEmitter-style API without importing the (native) `ssh2` module.
// `vi.hoisted` makes this object available to the async `ssh2` mock factory.
const clientBox = vi.hoisted(() => ({ current: undefined as unknown }));

interface FakeClientLike extends EventEmitter {
	exec: ReturnType<typeof vi.fn>;
	end: ReturnType<typeof vi.fn>;
	connect: ReturnType<typeof vi.fn>;
}

vi.mock("@dokploy/server/services/server", () => ({
	findServerById: mocks.findServerById,
}));

vi.mock("ssh2", async () => {
	const { EventEmitter } = await import("node:events");
	class FakeClient extends EventEmitter {
		public exec = vi.fn();
		public end = vi.fn();
		public connect = vi.fn(() => this);
		constructor() {
			super();
			clientBox.current = this;
		}
	}
	return { Client: FakeClient };
});

class FakeStream extends EventEmitter {
	public stderr: EventEmitter;

	constructor() {
		super();
		this.stderr = new EventEmitter();
	}
}

// `execAsyncRemote` `await`s `findServerById` before constructing the `Client`
// and calling `.connect()` synchronously inside the `new Promise(...)`
// executor, so a single macrotask boundary is enough to reach `.connect()`.
const flushMicrotasks = () =>
	new Promise<void>((resolve) => setImmediate(resolve));

const getLastClient = (): FakeClientLike => {
	const client = clientBox.current as FakeClientLike | undefined;
	if (!client) {
		throw new Error("No FakeClient was constructed");
	}
	return client;
};

const makeServer = () => ({
	serverId: "s1",
	sshKeyId: "key-1",
	ipAddress: "10.0.0.1",
	port: 2222,
	username: "root",
	sshKey: {
		privateKey:
			"-----BEGIN OPENSSH PRIVATE KEY-----\nmock-key\n-----END OPENSSH PRIVATE KEY-----",
	},
});

describe("execAsyncRemote", () => {
	beforeEach(() => {
		mocks.findServerById.mockReset();
		clientBox.current = undefined;
	});

	it("connects with the server's SSH credentials and resolves on exit code 0", async () => {
		mocks.findServerById.mockResolvedValue(makeServer());
		const onData = vi.fn();

		const promise = execAsyncRemote("s1", "echo hi", onData);
		await flushMicrotasks();

		const client = getLastClient();
		expect(client.connect).toHaveBeenCalledTimes(1);
		expect(client.connect).toHaveBeenCalledWith(
			expect.objectContaining({
				host: "10.0.0.1",
				port: 2222,
				username: "root",
				privateKey: expect.stringContaining("OPENSSH PRIVATE KEY"),
				timeout: 99999,
			}),
		);

		client.emit("ready");
		const stream = new FakeStream();
		client.exec.mock.calls[0]?.[1]?.(null, stream);

		stream.emit("data", "hello");
		stream.stderr.emit("data", "boom");
		stream.emit("close", 0, "");

		await expect(promise).resolves.toEqual({ stdout: "hello", stderr: "boom" });
		expect(client.end).toHaveBeenCalled();
		expect(onData).toHaveBeenCalledWith("hello");
		expect(onData).toHaveBeenCalledWith("boom");
	});

	// Regression guard for the dead `sleep(1000)` line that used to sit inside
	// the synchronous `new Promise(...)` executor (where `await` is illegal, so
	// the returned promise was discarded and no delay ever happened). Ensures
	// neither that line nor any equivalent 1s pre-connect timer is reintroduced.
	it("does not schedule a 1s pre-connect sleep timer before .connect()", async () => {
		mocks.findServerById.mockResolvedValue(makeServer());
		const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");

		try {
			const promise = execAsyncRemote("s1", "echo hi");
			await flushMicrotasks();

			const client = getLastClient();
			expect(client.connect).toHaveBeenCalledTimes(1);

			expect(
				setTimeoutSpy.mock.calls.filter((call) => call[1] === 1000),
			).toEqual([]);

			// Settle the pending connection so the test does not hang.
			client.emit("error", new Error("aborted"));
			await expect(promise).rejects.toThrow("SSH connection error: aborted");
		} finally {
			setTimeoutSpy.mockRestore();
		}
	});
});

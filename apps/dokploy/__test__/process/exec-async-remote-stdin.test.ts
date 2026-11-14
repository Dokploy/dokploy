import { beforeEach, describe, expect, it, vi } from "vitest";

const { clients, FakeClient } = await vi.hoisted(async () => {
	const { EventEmitter } = await import("node:events");
	class FakeClient extends EventEmitter {
		stream = Object.assign(new EventEmitter(), {
			stderr: new EventEmitter(),
			end: vi.fn(),
		});
		end = vi.fn();
		constructor() {
			super();
			clients.push(this);
		}
		connect() {
			setImmediate(() => this.emit("ready"));
			return this;
		}
		exec(
			_command: string,
			callback: (error: undefined, stream: unknown) => void,
		) {
			callback(undefined, this.stream);
		}
	}
	const clients: FakeClient[] = [];
	return { clients, FakeClient };
});

vi.mock("ssh2", () => ({ Client: FakeClient }));
vi.mock("@dokploy/server/services/server", () => ({
	findServerById: async () => ({
		sshKeyId: "key",
		sshKey: { privateKey: "key" },
	}),
}));

import { execAsyncRemote } from "@dokploy/server/utils/process/execAsync";

describe("remote exec stdin", () => {
	beforeEach(() => {
		clients.length = 0;
	});

	it.each(["", "synthetic-content".repeat(400000)])(
		"sends exact stdin and resolves on successful close (case %#)",
		async (input) => {
			const pending = execAsyncRemote(
				"server",
				"cat > '/quoted path'",
				undefined,
				input,
			);
			await vi.waitFor(() =>
				expect(clients[0]?.stream.end).toHaveBeenCalledWith(input),
			);
			const client = clients[0]!;
			client.stream.emit("close", 0);
			await expect(pending).resolves.toEqual({ stdout: "", stderr: "" });
			expect(client.end).toHaveBeenCalled();
		},
	);

	it("preserves remote stderr on nonzero close before stdin finishes", async () => {
		const pending = execAsyncRemote(
			"server",
			"cat > /missing/file",
			undefined,
			"synthetic-content",
		);
		const rejected = expect(pending).rejects.toMatchObject({
			exitCode: 1,
			stderr: "Permission denied",
		});
		await vi.waitFor(() => expect(clients[0]?.stream.end).toHaveBeenCalled());
		clients[0]!.stream.stderr.emit("data", "Permission denied");
		clients[0]!.stream.emit("close", 1);
		await rejected;
	});

	it("rejects EPIPE immediately without waiting for close", async () => {
		const pending = execAsyncRemote(
			"server",
			"cat > /file",
			undefined,
			"synthetic-content",
		);
		const error = Object.assign(new Error("write EPIPE"), { code: "EPIPE" });
		const rejected = expect(pending).rejects.toBe(error);
		await vi.waitFor(() => expect(clients[0]?.stream.end).toHaveBeenCalled());
		clients[0]!.stream.emit("error", error);
		await rejected;
		expect(clients[0]!.end).toHaveBeenCalled();
	});
});

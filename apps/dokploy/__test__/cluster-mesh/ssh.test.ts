import type { EventEmitter } from "node:events";
import { execOverSsh } from "@dokploy/server/services/cluster-mesh/ssh";
import { beforeEach, describe, expect, it, vi } from "vitest";

const remote = vi.hoisted(() => ({
	chunks: [] as Array<["stdout" | "stderr", string]>,
	exitCode: 0,
}));

vi.mock("ssh2", async () => {
	const events = await import("node:events");
	class Client extends events.EventEmitter {
		connect() {
			queueMicrotask(() => this.emit("ready"));
			return this;
		}
		exec(
			_command: string,
			callback: (error: Error | undefined, stream: EventEmitter) => void,
		) {
			const stream = Object.assign(new events.EventEmitter(), {
				stderr: new events.EventEmitter(),
				end: () => {
					for (const [kind, text] of remote.chunks) {
						(kind === "stdout" ? stream : stream.stderr).emit(
							"data",
							Buffer.from(text),
						);
					}
					stream.emit("close", remote.exitCode);
				},
			});
			callback(undefined, stream);
		}
		end() {}
	}
	return { Client };
});

const target = {
	host: "203.0.113.7",
	port: 22,
	username: "ubuntu",
	privateKey: "key",
};

describe("execOverSsh", () => {
	beforeEach(() => {
		remote.chunks = [];
		remote.exitCode = 0;
	});

	it("keeps stdout and stderr apart on success", async () => {
		remote.chunks = [
			["stdout", "os=ubuntu\n"],
			["stderr", "warning\n"],
			["stdout", "osVersion=26.04\n"],
		];

		await expect(execOverSsh(target, "true")).resolves.toEqual({
			stdout: "os=ubuntu\nosVersion=26.04\n",
			stderr: "warning\n",
		});
	});

	it("reports the last lines printed, from either stream, when a command fails", async () => {
		remote.exitCode = 1;
		remote.chunks = [
			["stdout", "Installing Docker 28.5.0...\n"],
			...Array.from(
				{ length: 20 },
				(_, index) =>
					["stderr", `+ sh -c step ${index}\n`] as ["stderr", string],
			),
			[
				"stdout",
				"ERROR: '28.5.0' not found amongst apt-cache madison results\n",
			],
		];

		const error = await execOverSsh(target, "install").catch((e) => e);

		expect(error.message).toContain("Command failed on 203.0.113.7 (exit 1)");
		expect(error.message).toMatch(
			/not found amongst apt-cache madison results$/,
		);
		expect(error.output.split("\n")).toHaveLength(15);
	});
});

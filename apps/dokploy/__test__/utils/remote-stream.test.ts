import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("@dokploy/server/services/server", () => ({
	findServerById: vi.fn(),
}));

import { pipeBetweenServers } from "@dokploy/server/utils/process/remoteStream";

describe("pipeBetweenServers", () => {
	it("delivers a short source stream that ends before the target is ready", async () => {
		const bytes = await pipeBetweenServers({
			source: { serverId: null, command: "printf 'hello world'" },
			target: { serverId: null, command: "sleep 0.3; cat > /dev/null" },
		});
		expect(bytes).toBe(11);
	});

	it("pipes data larger than the pipe buffer unchanged", async () => {
		const dir = await fs.mkdtemp(path.join(os.tmpdir(), "pipe-"));
		const source = path.join(dir, "src.bin");
		const target = path.join(dir, "dst.bin");
		const size = 1024 * 1024;
		const progress: number[] = [];

		const bytes = await pipeBetweenServers({
			source: {
				serverId: null,
				command: `head -c ${size} /dev/urandom | tee '${source}'`,
			},
			target: { serverId: null, command: `cat > '${target}'` },
			onProgress: (transferred) => progress.push(transferred),
		});

		expect(bytes).toBe(size);
		expect(progress.at(-1)).toBe(size);
		expect(await fs.readFile(target)).toEqual(await fs.readFile(source));
		await fs.rm(dir, { recursive: true, force: true });
	}, 30_000);

	it("reports a target failure with its stderr", async () => {
		await expect(
			pipeBetweenServers({
				source: { serverId: null, command: "printf x" },
				target: { serverId: null, command: "echo boom >&2; exit 3" },
			}),
		).rejects.toThrow("target exited with code 3: boom");
	});

	it("reports a source failure", async () => {
		await expect(
			pipeBetweenServers({
				source: { serverId: null, command: "exit 2" },
				target: { serverId: null, command: "cat > /dev/null" },
			}),
		).rejects.toThrow("source exited with code 2");
	});
});

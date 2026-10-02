import { describe, expect, it } from "vitest";
import { streamRestoreLogs } from "@/server/api/routers/restore-log-stream";

describe("restore log stream", () => {
	it("ends with an error after delivering failure logs", async () => {
		const logs: string[] = [];
		const stream = streamRestoreLogs(async (emit) => {
			emit("Migrating restored 2FA secrets...");
			throw new Error("Unknown auth secret");
		});

		await expect(async () => {
			for await (const log of stream) {
				logs.push(log);
			}
		}).rejects.toThrow("Unknown auth secret");
		expect(logs).toEqual([
			"Migrating restored 2FA secrets...",
			"Error: Unknown auth secret",
		]);
	});

	it("completes normally after a successful restore", async () => {
		const logs: string[] = [];
		for await (const log of streamRestoreLogs(async (emit) => {
			emit("Restore completed successfully!");
		})) {
			logs.push(log);
		}
		expect(logs).toEqual(["Restore completed successfully!"]);
	});
});

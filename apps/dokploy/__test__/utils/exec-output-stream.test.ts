import { execAsyncStream } from "@dokploy/server/utils/process/execAsync";
import { describe, expect, it, vi } from "vitest";

vi.mock("@dokploy/server/services/server", () => ({
	findServerById: vi.fn(),
}));

describe.skipIf(process.platform === "win32")(
	"process output stream labels",
	() => {
		it("identifies stdout and stderr for independent streaming redaction", async () => {
			const onData = vi.fn();
			const result = await execAsyncStream(
				"printf 'output'; printf 'diagnostic' >&2",
				onData,
				{ includeStream: true },
			);
			expect(onData).toHaveBeenCalledWith("output", "stdout");
			expect(onData).toHaveBeenCalledWith("diagnostic", "stderr");
			expect(result).toEqual({ stdout: "output", stderr: "diagnostic" });
		});
		it("preserves the existing single-argument output callback by default", async () => {
			const onData = vi.fn();
			await execAsyncStream("printf 'output'", onData);
			expect(onData.mock.calls).toEqual([["output"]]);
		});
	},
);

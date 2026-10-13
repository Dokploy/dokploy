import { getContainerLogs } from "@dokploy/server/services/docker";
import { execAsync } from "@dokploy/server/utils/process/execAsync";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@dokploy/server/utils/process/execAsync", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("@dokploy/server/utils/process/execAsync")
	>()),
	execAsync: vi.fn(),
}));

describe("getContainerLogs", () => {
	beforeEach(() => {
		vi.mocked(execAsync).mockReset();
		vi.mocked(execAsync).mockResolvedValue({ stdout: "", stderr: "" });
	});

	it("applies tail to the docker logs when not searching", async () => {
		await getContainerLogs("abc123", 50, "all", undefined, null, true);

		expect(execAsync).toHaveBeenCalledWith(
			expect.stringMatching(
				/^docker container logs --timestamps --tail 50 .*abc123 2>&1$/,
			),
		);
	});

	it("applies tail to the matches when searching", async () => {
		await getContainerLogs("abc123", 5, "24h", "Prisma", null, true);

		const command = vi.mocked(execAsync).mock.calls[0]?.[0] ?? "";
		expect(command).not.toContain("--tail");
		expect(command).toContain("--since 24h");
		expect(command).toMatch(/\| grep -iF 'Prisma' \| tail -n 5$/);
	});
});

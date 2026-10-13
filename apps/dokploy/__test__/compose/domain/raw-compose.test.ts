import { addDomainToCompose } from "@dokploy/server/utils/docker/domain";
import { execAsyncRemote } from "@dokploy/server/utils/process/execAsync";
import { describe, expect, it, vi } from "vitest";

vi.mock("@dokploy/server/utils/process/execAsync", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("@dokploy/server/utils/process/execAsync")
	>()),
	execAsyncRemote: vi.fn(),
}));

describe("raw remote compose conversion (#4794)", () => {
	it("uses the saved raw source and preserves supported mount syntax", async () => {
		vi.mocked(execAsyncRemote).mockResolvedValue({
			stdout: "services:\n  test:\n    image: alpine:latest\n",
			stderr: "",
		});

		const compose = {
			appName: "raw-stack",
			composeFile: `
services:
  test:
    image: alpine:latest
    volumes:
      - type: tmpfs
        target: /scratch
      - type: volume
        source: test-data
        target: /data
    tmpfs:
      - /cache
volumes:
  test-data:
`,
			composePath: "./docker-compose.yml",
			composeType: "stack",
			isolatedDeployment: false,
			isolatedDeploymentsVolume: false,
			randomize: false,
			serverId: "remote-server",
			sourceType: "raw",
			suffix: "",
		} as unknown as Parameters<typeof addDomainToCompose>[0];

		const converted = await addDomainToCompose(compose, []);

		expect(converted?.services?.test?.volumes).toEqual([
			{ type: "tmpfs", target: "/scratch" },
			{
				type: "volume",
				source: "test-data",
				target: "/data",
			},
		]);
		expect(converted?.services?.test?.tmpfs).toEqual(["/cache"]);
		expect(execAsyncRemote).not.toHaveBeenCalled();
	});
});

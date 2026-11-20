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
			composeId: "compose-1",
			name: "raw-stack",
			composePath: "./docker-compose.yml",
			composeType: "stack",
			environment: {
				environmentId: "env-1",
				name: "production",
				projectId: "project-1",
				project: { name: "shop", organizationId: "org-1" },
			},
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
		expect(converted?.services?.test?.labels).toEqual(
			expect.arrayContaining([
				"dokploy.organization.id=org-1",
				"dokploy.project=shop",
				"dokploy.service=test",
			]),
		);
		expect(converted?.services?.test?.deploy?.labels).toEqual(
			expect.arrayContaining(["dokploy.organization.id=org-1"]),
		);
		expect(execAsyncRemote).not.toHaveBeenCalled();
	});

	it("escapes `$` in the Dokploy label values so compose keeps them literal", async () => {
		const compose = {
			appName: "dollar-stack",
			composeFile: `
services:
  mapped:
    image: alpine:latest
    labels:
      custom: keep
    deploy:
      labels:
        custom: keep
  listed:
    image: alpine:latest
    labels:
      - custom=keep
`,
			composeId: "compose-1",
			name: "app $DB_PASSWORD",
			composePath: "./docker-compose.yml",
			composeType: "stack",
			environment: {
				environmentId: "env-1",
				name: "env ${HOME}",
				projectId: "project-1",
				project: { name: "Budget $100", organizationId: "org-1" },
			},
			isolatedDeployment: false,
			isolatedDeploymentsVolume: false,
			randomize: false,
			serverId: null,
			sourceType: "raw",
			suffix: "",
		} as unknown as Parameters<typeof addDomainToCompose>[0];

		const converted = await addDomainToCompose(compose, []);
		const escaped = {
			"dokploy.project": "Budget $$100",
			"dokploy.environment": "env $${HOME}",
			"dokploy.application": "app $$DB_PASSWORD",
		};

		const mapped = converted?.services?.mapped;
		expect(mapped?.labels).toMatchObject({ custom: "keep", ...escaped });
		expect(mapped?.deploy?.labels).toMatchObject({
			custom: "keep",
			...escaped,
		});
		const listed = converted?.services?.listed;
		const asList = Object.entries(escaped).map(([k, v]) => `${k}=${v}`);
		expect(listed?.labels).toEqual(
			expect.arrayContaining(["custom=keep", ...asList]),
		);
		expect(listed?.deploy?.labels).toEqual(expect.arrayContaining(asList));
	});
});

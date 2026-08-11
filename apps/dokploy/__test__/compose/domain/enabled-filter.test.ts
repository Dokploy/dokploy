import type { Compose } from "@dokploy/server/services/compose";
import type { Domain } from "@dokploy/server/services/domain";
import { addDomainToCompose } from "@dokploy/server/utils/docker/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";

// addDomainToCompose reads the compose file from disk through loadDockerCompose
// (existsSync + readFileSync). Mock node:fs so the function runs its real
// label-generation logic against an in-memory compose spec.
const baseComposeYaml = `
services:
  frigate:
    image: frigate
`;
let composeYaml = baseComposeYaml;

vi.mock("node:fs", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:fs")>();
	return {
		...actual,
		existsSync: vi.fn(() => true),
		readFileSync: vi.fn(() => composeYaml),
	};
});

const baseCompose = {
	appName: "test-app",
	composeType: "docker-compose",
	composePath: "docker-compose.yml",
	sourceType: "raw",
	serverId: null,
	isolatedDeployment: false,
	randomize: false,
	suffix: "",
} as unknown as Compose;

const baseDomain: Domain = {
	host: "frigate.example.com",
	port: 8971,
	customEntrypoint: null,
	https: false,
	uniqueConfigKey: 1,
	customCertResolver: null,
	certificateType: "none",
	applicationId: "",
	composeId: "compose-id",
	domainType: "compose",
	serviceName: "frigate",
	domainId: "domain-id",
	path: "/",
	createdAt: "",
	previewDeploymentId: "",
	internalPath: "/",
	stripPath: false,
	middlewares: null,
	forwardAuthEnabled: false,
	enabled: true,
};

const serviceLabels = (
	result: Awaited<ReturnType<typeof addDomainToCompose>>,
) => (result?.services?.frigate?.labels as string[] | undefined) ?? [];

describe("addDomainToCompose enabled filtering", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		composeYaml = baseComposeYaml;
	});

	it("generates traefik labels for an enabled domain", async () => {
		const result = await addDomainToCompose(baseCompose, [
			{ ...baseDomain, enabled: true },
		]);

		const labels = serviceLabels(result);
		expect(labels).toContain("traefik.enable=true");
		expect(labels.some((l) => l.includes("Host(`frigate.example.com`)"))).toBe(
			true,
		);
	});

	it("skips a disabled domain entirely (no traefik labels)", async () => {
		const result = await addDomainToCompose(baseCompose, [
			{ ...baseDomain, enabled: false },
		]);

		const labels = serviceLabels(result);
		expect(labels).not.toContain("traefik.enable=true");
		expect(labels.some((l) => l.includes("Host(`frigate.example.com`)"))).toBe(
			false,
		);
	});

	it.each([
		[
			"docker-compose",
			`services:
  frigate:
    image: frigate
    labels:
      - traefik.enable=true
      - traefik.http.routers.test-app-1-web.rule=Host(\`frigate.example.com\`)
      - traefik.http.services.test-app-1-web.loadbalancer.server.port=8971
      - traefik.http.middlewares.stripprefix-test-app-1.stripprefix.prefixes=/api
      - custom.label=preserved
`,
		],
		[
			"stack",
			`services:
  frigate:
    image: frigate
    deploy:
      labels:
        - traefik.enable=true
        - traefik.http.routers.test-app-1-web.rule=Host(\`frigate.example.com\`)
        - traefik.http.services.test-app-1-web.loadbalancer.server.port=8971
        - traefik.http.middlewares.stripprefix-test-app-1.stripprefix.prefixes=/api
        - custom.label=preserved
`,
		],
	] as const)(
		"removes stale labels for a disabled domain from %s rebuilds",
		async (composeType, staleComposeYaml) => {
			composeYaml = staleComposeYaml;

			const result = await addDomainToCompose({ ...baseCompose, composeType }, [
				{ ...baseDomain, enabled: false },
			]);

			const service = result?.services?.frigate;
			const labels =
				composeType === "docker-compose"
					? service?.labels
					: service?.deploy?.labels;
			expect(labels).toContain("custom.label=preserved");
			expect(
				(labels as string[]).some((label) => label.includes("test-app-1")),
			).toBe(false);
		},
	);

	it.each([
		[
			"docker-compose",
			`services:
  frigate:
    image: frigate
    labels:
      traefik.enable: "true"
      traefik.http.routers.test-app-1-web.rule: Host(\`frigate.example.com\`)
      traefik.http.services.test-app-1-web.loadbalancer.server.port: 8971
      traefik.http.middlewares.stripprefix-test-app-1.stripprefix.prefixes: /api
      custom.label: preserved
`,
		],
		[
			"stack",
			`services:
  frigate:
    image: frigate
    deploy:
      labels:
        traefik.enable: "true"
        traefik.http.routers.test-app-1-web.rule: Host(\`frigate.example.com\`)
        traefik.http.services.test-app-1-web.loadbalancer.server.port: 8971
        traefik.http.middlewares.stripprefix-test-app-1.stripprefix.prefixes: /api
        custom.label: preserved
`,
		],
	] as const)(
		"removes stale mapping labels for a disabled domain from %s rebuilds",
		async (composeType, staleComposeYaml) => {
			composeYaml = staleComposeYaml;

			const result = await addDomainToCompose({ ...baseCompose, composeType }, [
				{ ...baseDomain, enabled: false },
			]);

			const service = result?.services?.frigate;
			const labels =
				composeType === "docker-compose"
					? service?.labels
					: service?.deploy?.labels;
			expect(labels).toMatchObject({ "custom.label": "preserved" });
			expect(
				Object.keys(labels ?? {}).some((label) => label.includes("test-app-1")),
			).toBe(false);
		},
	);

	it("emits labels only for the enabled domain when both are present", async () => {
		const result = await addDomainToCompose(baseCompose, [
			{ ...baseDomain, host: "enabled.example.com", enabled: true },
			{
				...baseDomain,
				host: "disabled.example.com",
				uniqueConfigKey: 2,
				enabled: false,
			},
		]);

		const labels = serviceLabels(result);
		expect(labels.some((l) => l.includes("Host(`enabled.example.com`)"))).toBe(
			true,
		);
		expect(labels.some((l) => l.includes("Host(`disabled.example.com`)"))).toBe(
			false,
		);
	});
});

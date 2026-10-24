import type { Compose } from "@dokploy/server/services/compose";
import type { Domain } from "@dokploy/server/services/domain";
import { addDomainToCompose } from "@dokploy/server/utils/docker/domain";
import { describe, expect, it } from "vitest";

const listAnchorYaml = `
x-common: &common
  restart: unless-stopped
  labels:
    - com.example.team=platform
  networks: [default, dokploy-network]

services:
  api:
    <<: *common
    image: nginx
  worker:
    <<: *common
    image: busybox
`;

const mapAnchorYaml = `
x-common: &common
  networks:
    default: {}
    shared:
      aliases: [shared-api]

services:
  api:
    <<: *common
    image: nginx
`;

const defaultOnlyAnchorYaml = `
x-common: &common
  networks: [default]

services:
  api:
    <<: *common
    image: nginx
  worker:
    <<: *common
    image: busybox
`;

const buildCompose = (composeFile: string, isolatedDeployment = false) =>
	({
		appName: "merge-app",
		composeType: "docker-compose",
		composePath: "docker-compose.yml",
		sourceType: "raw",
		serverId: null,
		isolatedDeployment,
		isolatedDeploymentsVolume: false,
		randomize: false,
		suffix: "",
		composeFile,
	}) as unknown as Compose;

const domain: Domain = {
	host: "api.example.com",
	port: 80,
	customEntrypoint: null,
	https: false,
	uniqueConfigKey: 1,
	customCertResolver: null,
	certificateType: "none",
	applicationId: "",
	composeId: "compose-id",
	domainType: "compose",
	serviceName: "api",
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

describe("compose services using YAML merge keys (#5625)", () => {
	it("keeps anchor networks when a domain is attached", async () => {
		const result = await addDomainToCompose(buildCompose(listAnchorYaml), [
			domain,
		]);

		expect(result?.services?.api).not.toHaveProperty("<<");
		expect(result?.services?.api?.networks).toEqual(
			expect.arrayContaining(["default", "dokploy-network"]),
		);
		expect(result?.services?.api?.restart).toBe("unless-stopped");
	});

	it("keeps anchor networks on isolated deployments", async () => {
		const result = await addDomainToCompose(
			buildCompose(listAnchorYaml, true),
			[],
		);

		expect(result?.services?.api?.networks).toEqual(
			expect.arrayContaining(["default", "dokploy-network", "merge-app"]),
		);
		expect(result?.services?.worker?.networks).toEqual(
			expect.arrayContaining(["default", "dokploy-network", "merge-app"]),
		);
	});

	it("keeps anchor labels next to the Dokploy labels", async () => {
		const result = await addDomainToCompose(buildCompose(listAnchorYaml), [
			domain,
		]);

		expect(result?.services?.api?.labels).toEqual(
			expect.arrayContaining([
				"com.example.team=platform",
				"traefik.enable=true",
				"traefik.docker.network=dokploy-network",
			]),
		);
	});

	it("keeps map-form anchor networks", async () => {
		const result = await addDomainToCompose(buildCompose(mapAnchorYaml), [
			domain,
		]);

		expect(result?.services?.api?.networks).toMatchObject({
			default: {},
			shared: { aliases: ["shared-api"] },
			"dokploy-network": {},
		});
	});

	it("does not leak injected networks into sibling services", async () => {
		const result = await addDomainToCompose(
			buildCompose(defaultOnlyAnchorYaml),
			[domain],
		);

		expect(result?.services?.api?.networks).toEqual(
			expect.arrayContaining(["default", "dokploy-network"]),
		);
		expect(result?.services?.worker?.networks).toEqual(["default"]);
	});
});

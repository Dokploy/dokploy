import { db } from "@dokploy/server/db";
import {
	findClusterPreflightIssues,
	isPinned,
} from "@dokploy/server/services/cluster-mesh/preflight";
import { readComposeSnapshot } from "@dokploy/server/services/scaling/compose-snapshot";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parse } from "yaml";

vi.mock(
	"@dokploy/server/services/scaling/compose-snapshot",
	async (importActual) => ({
		...(await importActual<
			typeof import("@dokploy/server/services/scaling/compose-snapshot")
		>()),
		readComposeSnapshot: vi.fn(),
	}),
);

const environment = (organizationId = "org-1") => ({
	projectId: "p1",
	project: { organizationId },
});

const app = (overrides: Record<string, unknown>) => ({
	applicationId: "a1",
	name: "web",
	environmentId: "e1",
	environment: environment(),
	sourceType: "github",
	registryId: null,
	buildRegistryId: null,
	placementSwarm: null,
	mounts: [],
	...overrides,
});

describe("isPinned", () => {
	it.each([
		[["node.role==manager"], true],
		[["node.role == manager"], true],
		[["node.hostname==vm-1"], true],
		[["node.id==abc"], true],
		[["node.role==worker"], false],
		[["node.labels.zone==eu"], false],
		[[], false],
	])("%j → %s", (constraints, pinned) => {
		expect(isPinned(constraints)).toBe(pinned);
	});
});

describe("findClusterPreflightIssues", () => {
	beforeEach(() => {
		vi.mocked(db.query.applications.findMany).mockReset();
		vi.mocked(readComposeSnapshot).mockReset().mockResolvedValue(null);
	});

	it("flags locally built apps and unpinned named volumes", async () => {
		vi.mocked(db.query.applications.findMany)
			.mockResolvedValueOnce([
				app({ applicationId: "built", name: "built" }),
				app({ applicationId: "pulled", name: "pulled", sourceType: "docker" }),
				app({ applicationId: "pushed", name: "pushed", registryId: "r1" }),
				app({
					applicationId: "pinned-by-default",
					name: "db-app",
					mounts: [{ type: "volume" }],
				}),
				app({
					applicationId: "unpinned-volume",
					name: "files",
					sourceType: "docker",
					placementSwarm: { Constraints: [] },
					mounts: [{ type: "volume" }],
				}),
				app({
					applicationId: "other-org",
					name: "other",
					environment: environment("org-2"),
				}),
			] as never)
			.mockResolvedValueOnce([] as never);

		const findings = await findClusterPreflightIssues({
			serverId: null,
			organizationId: "org-1",
		});

		expect(findings.map((f) => [f.id, f.reason.slice(0, 20)])).toEqual([
			["built", "Its image is built o"],
			["unpinned-volume", "It stores data in a "],
		]);
		expect(findings[0]?.href).toBe(
			"/dashboard/project/p1/environment/e1/services/application/built",
		);
	});

	it("flags stack services that build or use named volumes without a pin", async () => {
		vi.mocked(db.query.applications.findMany)
			.mockResolvedValueOnce([] as never)
			.mockResolvedValueOnce([
				{
					composeId: "c1",
					name: "shop",
					composeType: "stack",
					environmentId: "e1",
					environment: environment(),
				},
				{
					composeId: "c2",
					name: "plain",
					composeType: "docker-compose",
					environmentId: "e1",
					environment: environment(),
				},
			] as never);
		vi.mocked(readComposeSnapshot).mockResolvedValue({
			spec: parse(`
services:
  api:
    build: .
  db:
    image: postgres
    volumes: ["pgdata:/var/lib/postgresql/data"]
  cache:
    image: redis
    volumes: ["./redis.conf:/etc/redis.conf"]
  pinned:
    image: postgres
    volumes: ["data:/data"]
    deploy:
      placement:
        constraints: ["node.role == manager"]
`),
			composeType: "stack",
			projectDirectory: "/code",
			files: { dir: "", compose: "", env: "" },
		});

		const findings = await findClusterPreflightIssues({
			serverId: null,
			organizationId: "org-1",
		});

		expect(findings.map((f) => `${f.name}/${f.serviceName}`)).toEqual([
			"shop/api",
			"shop/db",
		]);
	});
});

import {
	enrichDockerDiskUsageDetails,
	limitDockerDiskUsageDetails,
	parseDockerDiskUsageSummary,
	parseDockerDiskUsageVerbose,
	resolveDockerDiskUsageDetailLimit,
} from "@dokploy/server/utils/docker/utils";
import { describe, expect, test } from "vitest";

const summaryOutput = [
	'{"Active":"3","Reclaimable":"92.61MB (0%)","Size":"15.84GB","TotalCount":"4","Type":"Images"}',
	'{"Active":"3","Reclaimable":"0B (0%)","Size":"53.25kB","TotalCount":"3","Type":"Containers"}',
	'{"Active":"2","Reclaimable":"0B (0%)","Size":"68.57MB","TotalCount":"2","Type":"Local Volumes"}',
	'{"Active":"0","Reclaimable":"15.2GB","Size":"15.2GB","TotalCount":"326","Type":"Build Cache"}',
].join("\n");

const verboseOutput = [
	"Images space usage:",
	"",
	"REPOSITORY   TAG       IMAGE ID       CREATED        SIZE      SHARED SIZE   UNIQUE SIZE   CONTAINERS",
	"nginx        alpine    8b1e78743a03   2 weeks ago    92.6MB    0B            92.61MB       0",
	"postgres     16        4b7183ac05f8   2 weeks ago    663MB     0B            662.9MB       1",
	"",
	"Containers space usage:",
	"",
	"CONTAINER ID   IMAGE            COMMAND                  LOCAL VOLUMES   SIZE      CREATED             STATUS             NAMES",
	'057f8980d33f   postgres:16      "docker-entrypoint.s…"   1               20.5kB    About an hour ago   Up About an hour   dokploy-postgres.1.test',
	'fc4976a35ce3   redis:7          "docker-entrypoint.s…"   1               4.1kB     About an hour ago   Up About an hour   dokploy-redis.1.test',
	"",
	"Local Volumes space usage:",
	"",
	"VOLUME NAME        LINKS     SIZE",
	"dokploy-redis      1         226B",
	"dokploy-postgres   1         68.57MB",
	"",
	"Build cache usage: 15.2GB",
	"",
	"CACHE ID       CACHE TYPE     SIZE      CREATED       LAST USED     USAGE     SHARED",
	"8vq5d5k500k0   regular        13.4MB    5 days ago    5 days ago    1         false",
	"gso67gl55f9c   regular        123MB     5 days ago    5 days ago    1         false",
].join("\n");

describe("parseDockerDiskUsageSummary", () => {
	test("parses Docker system df summary output", () => {
		expect(parseDockerDiskUsageSummary(summaryOutput)).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					active: 3,
					reclaimable: "92.61MB (0%)",
					size: "15.84GB",
					sizeBytes: 15.84 * 1024 ** 3,
					totalCount: 4,
					type: "Images",
				}),
				expect.objectContaining({
					active: 3,
					size: "53.25kB",
					sizeBytes: 53.25 * 1024,
					totalCount: 3,
					type: "Containers",
				}),
			]),
		);
	});
});

describe("parseDockerDiskUsageVerbose", () => {
	test("parses verbose Docker disk usage sections and sorts details by size", () => {
		const details = parseDockerDiskUsageVerbose(verboseOutput);

		expect(details.images[0]).toEqual(
			expect.objectContaining({
				id: "4b7183ac05f8",
				name: "postgres:16",
				size: "663MB",
				sizeBytes: 663 * 1024 ** 2,
			}),
		);
		expect(details.containers[0]).toEqual(
			expect.objectContaining({
				id: "057f8980d33f",
				name: "dokploy-postgres.1.test",
				size: "20.5kB",
			}),
		);
		expect(details.volumes[0]).toEqual(
			expect.objectContaining({
				id: "dokploy-postgres",
				name: "dokploy-postgres",
				size: "68.57MB",
			}),
		);
		expect(details.buildCache[0]).toEqual(
			expect.objectContaining({
				id: "gso67gl55f9c",
				name: "regular",
				size: "123MB",
			}),
		);
	});

	test("enriches dangling images and volumes with inspect context", () => {
		const details = parseDockerDiskUsageVerbose(
			[
				"Images space usage:",
				"",
				"REPOSITORY   TAG       IMAGE ID       CREATED       SIZE     SHARED SIZE   UNIQUE SIZE   CONTAINERS",
				"<none>       <none>    2e7598a736d0   2 hours ago   2.99GB   247.5MB       2.743GB       1",
				"",
				"Containers space usage:",
				"",
				"CONTAINER ID   IMAGE          COMMAND                  LOCAL VOLUMES   SIZE   CREATED       STATUS      NAMES",
				'274333ea2993   2e7598a736d0  "docker-entrypoint.s…"   1               0B     2 hours ago   Exited      dokploy.1.test',
				"",
				"Local Volumes space usage:",
				"",
				"VOLUME NAME        LINKS     SIZE",
				"dokploy-postgres   1         69.41MB",
			].join("\n"),
		);

		const enriched = enrichDockerDiskUsageDetails(details, {
			containers: [
				{
					id: "274333ea2993",
					image: "2e7598a736d0",
					name: "dokploy.1.test",
				},
			],
			imageInspects: new Map([
				[
					"2e7598a736d0",
					{
						Id: "sha256:2e7598a736d0full",
						RepoDigests: [],
						RepoTags: ["<none>:<none>"],
					},
				],
			]),
			volumeInspects: new Map([
				[
					"dokploy-postgres",
					{
						Driver: "local",
						Mountpoint: "/var/lib/docker/volumes/dokploy-postgres/_data",
						Name: "dokploy-postgres",
					},
				],
			]),
		});

		expect(enriched.images[0]).toEqual(
			expect.objectContaining({
				name: "<none>:<none>",
				subtitle: "Dangling local image",
			}),
		);
		expect(enriched.images[0]?.meta).toEqual(
			expect.arrayContaining([
				{
					label: "Full image id",
					value: "sha256:2e7598a736d0full",
				},
				{
					label: "Source",
					value: "dangling local image",
				},
				{
					label: "Used by",
					value: "dokploy.1.test",
				},
			]),
		);
		expect(enriched.volumes[0]?.meta).toEqual(
			expect.arrayContaining([
				{
					label: "Mountpoint",
					value: "/var/lib/docker/volumes/dokploy-postgres/_data",
				},
				{
					label: "Driver",
					value: "local",
				},
			]),
		);
	});
});

describe("limitDockerDiskUsageDetails", () => {
	const makeDetail = (index: number) => ({
		id: `image-${index}`,
		meta: [],
		name: `image:${index}`,
		size: `${index}MB`,
		sizeBytes: index * 1024 ** 2,
	});

	test("limits detail rows by selected count and allows all rows", () => {
		const details = {
			buildCache: [],
			containers: [],
			images: Array.from({ length: 18 }, (_, index) => makeDetail(index + 1)),
			volumes: Array.from({ length: 12 }, (_, index) => makeDetail(index + 1)),
		};

		expect(limitDockerDiskUsageDetails(details).images).toHaveLength(10);
		expect(limitDockerDiskUsageDetails(details, 5).images).toHaveLength(5);
		expect(limitDockerDiskUsageDetails(details, 15).images).toHaveLength(15);
		expect(limitDockerDiskUsageDetails(details, null).images).toHaveLength(18);
		expect(limitDockerDiskUsageDetails(details, null).volumes).toHaveLength(12);
	});
});

describe("resolveDockerDiskUsageDetailLimit", () => {
	test("defaults only missing values and preserves all rows selection", () => {
		expect(resolveDockerDiskUsageDetailLimit(undefined)).toBe(10);
		expect(resolveDockerDiskUsageDetailLimit(5)).toBe(5);
		expect(resolveDockerDiskUsageDetailLimit(15)).toBe(15);
		expect(resolveDockerDiskUsageDetailLimit(null)).toBeNull();
	});
});

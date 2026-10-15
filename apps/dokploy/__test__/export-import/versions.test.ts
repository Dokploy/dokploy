import type {
	ExportScope,
	InstanceVersions,
	SourceInstance,
} from "@dokploy/server/services/project-export-import";
import {
	collectDockerVersions,
	compareDockerVersions,
	compareInstanceVersions,
	isPinnedImage,
} from "@dokploy/server/services/project-export-import";
import { describe, expect, it } from "vitest";

const destination: InstanceVersions = {
	dokployVersion: "v0.30.6",
	releaseTag: "latest",
	isCloud: false,
	traefikVersion: "3.6.25",
	nodeVersion: "v22.0.0",
};

const source = (overrides: Partial<SourceInstance>): SourceInstance => ({
	dokployVersion: "v0.30.6",
	organizationId: "org-src",
	releaseTag: "latest",
	isCloud: false,
	traefikVersion: "3.6.25",
	...overrides,
});

const codesOf = (warnings: { code: string; severity: string }[]) =>
	warnings.map((w) => `${w.code}:${w.severity}`);

describe("compareInstanceVersions", () => {
	it("is silent when everything matches", () => {
		expect(compareInstanceVersions(source({}), destination)).toEqual([]);
	});

	it("warns when the bundle comes from a newer Dokploy", () => {
		const warnings = compareInstanceVersions(
			source({ dokployVersion: "v0.31.0" }),
			destination,
		);
		expect(codesOf(warnings)).toEqual(["DOKPLOY_VERSION_MISMATCH:warning"]);
	});

	it("only informs when the bundle comes from an older Dokploy", () => {
		const warnings = compareInstanceVersions(
			source({ dokployVersion: "v0.29.0" }),
			destination,
		);
		expect(codesOf(warnings)).toEqual(["DOKPLOY_VERSION_MISMATCH:info"]);
	});

	it("informs when versions are not comparable but differ", () => {
		const warnings = compareInstanceVersions(
			source({ dokployVersion: "canary", releaseTag: "canary" }),
			destination,
		);
		expect(codesOf(warnings)).toEqual(["DOKPLOY_VERSION_MISMATCH:info"]);
		expect(warnings[0]?.message).toContain("can't be compared");
	});

	it("flags cloud to self-hosted and traefik differences", () => {
		const warnings = compareInstanceVersions(
			source({ isCloud: true, traefikVersion: "3.4.0" }),
			destination,
		);
		expect(codesOf(warnings)).toEqual([
			"INSTANCE_KIND_MISMATCH:info",
			"TRAEFIK_VERSION_MISMATCH:info",
		]);
	});

	it("ignores fields an older bundle does not carry", () => {
		const warnings = compareInstanceVersions(
			{ dokployVersion: "v0.30.6", organizationId: "org-src" },
			destination,
		);
		expect(warnings).toEqual([]);
	});
});

describe("compareDockerVersions", () => {
	it("reports a different major version", () => {
		expect(compareDockerVersions("26.1.0", "27.0.1")).toContain(
			"different major version",
		);
	});

	it("accepts the same major version", () => {
		expect(compareDockerVersions("27.0.1", "27.3.0")).toBeUndefined();
	});

	it("is silent without a source version", () => {
		expect(compareDockerVersions(undefined, "27.0.1")).toBeUndefined();
	});
});

describe("isPinnedImage", () => {
	it.each([
		["postgres:17", true],
		["ghcr.io/org/app:v1.2.3", true],
		["registry:5000/org/app@sha256:abc", true],
		["postgres", false],
		["postgres:latest", false],
		["registry:5000/org/app", false],
	])("%s → %s", (image, pinned) => {
		expect(isPinnedImage(image)).toBe(pinned);
	});
});

describe("collectDockerVersions", () => {
	const scope: ExportScope = {
		includeEnvSecrets: true,
		shared: {},
		files: {
			applicationSources: true,
			composeFiles: true,
			traefikRaw: true,
			customCertificates: true,
		},
		dumps: { mode: "none" },
		includeBackupSchedules: true,
	};

	const tree = {
		projectId: "project-1",
		name: "p",
		organizationId: "org-1",
		env: "",
		environments: [
			{
				environmentId: "env-1",
				name: "production",
				env: "",
				applications: [
					{ applicationId: "app-1", appName: "app-one", serverId: null },
					{ applicationId: "app-2", appName: "app-two", serverId: "srv-1" },
				],
				compose: [],
				postgres: [
					{ postgresId: "pg-1", appName: "pg-one", serverId: "srv-1" },
				],
				mysql: [],
				mariadb: [],
				mongo: [],
				redis: [],
				libsql: [],
			},
		],
	};

	it("probes each distinct server once and keys local as 'local'", async () => {
		const probed: (string | null)[] = [];
		const versions = await collectDockerVersions(
			tree as never,
			scope,
			async (serverId) => {
				probed.push(serverId);
				return serverId ? "26.1.0" : "27.0.1";
			},
		);
		expect(probed).toEqual([null, "srv-1"]);
		expect(versions).toEqual({ local: "27.0.1", "srv-1": "26.1.0" });
	});

	it("skips servers whose probe fails", async () => {
		const versions = await collectDockerVersions(
			tree as never,
			scope,
			async (serverId) => {
				if (serverId) throw new Error("ssh down");
				return "27.0.1";
			},
		);
		expect(versions).toEqual({ local: "27.0.1" });
	});
});

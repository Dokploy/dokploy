import {
	classifyStudioDatabases,
	exclusionMessage,
	type OverlayNetworkRef,
} from "@dokploy/server/utils/libredb-studio/reachability";
import {
	renderSeedConfig,
	type SeedLabels,
	type StudioDatabase,
	serializeSeedConfig,
	validateSeedConfig,
} from "@dokploy/server/utils/libredb-studio/seed";
import { describe, expect, it } from "vitest";

const database = (overrides: Partial<StudioDatabase>): StudioDatabase => ({
	kind: "postgres",
	id: "db-1",
	name: "Orders DB",
	appName: "demo-shop-orders-db-e6qmrw",
	serverId: null,
	databaseName: "orders",
	databaseUser: "orders",
	databasePassword: "orders-pass",
	databaseRootPassword: null,
	sqldNode: null,
	networkIds: [],
	detachDokployNetwork: false,
	hasNetworkSwarm: false,
	applicationStatus: "done",
	...overrides,
});

const overlay = (
	networkId: string,
	serverId: string | null = null,
	driver = "overlay",
): OverlayNetworkRef => ({ networkId, serverId, driver });

const localStudio = { serverId: null };
const remoteStudio = { serverId: "srv-a" };

const labels: SeedLabels = {
	projectName: "Demo Shop",
	environmentName: "production",
};

describe("classifyStudioDatabases", () => {
	it("covers a database on the Dokploy host for a Studio on the Dokploy host", () => {
		const db = database({});
		expect(classifyStudioDatabases([db], localStudio, [])).toEqual({
			covered: [db],
			excluded: [],
			requiredNetworkIds: [],
		});
	});

	it("covers a database on the same remote server", () => {
		const db = database({ serverId: "srv-a" });
		const coverage = classifyStudioDatabases([db], remoteStudio, []);
		expect(coverage.covered).toEqual([db]);
		expect(coverage.excluded).toEqual([]);
	});

	it("excludes a database on another remote server", () => {
		const db = database({ serverId: "srv-b" });
		expect(classifyStudioDatabases([db], remoteStudio, [])).toEqual({
			covered: [],
			excluded: [{ database: db, reason: "other-server" }],
			requiredNetworkIds: [],
		});
	});

	it("treats a null serverId as the Dokploy host on both sides", () => {
		const onHost = database({ id: "db-host", serverId: null });
		const onRemote = database({ id: "db-remote", serverId: "srv-a" });
		expect(
			classifyStudioDatabases([onHost], remoteStudio, []).excluded,
		).toEqual([{ database: onHost, reason: "other-server" }]);
		expect(
			classifyStudioDatabases([onRemote], localStudio, []).excluded,
		).toEqual([{ database: onRemote, reason: "other-server" }]);
	});

	it.each<[string, Partial<StudioDatabase>]>([
		["user", { databaseUser: "${JWT_SECRET}" }],
		["database name", { databaseName: "${vault:secret/data/studio#jwt}" }],
		[
			"Redis password",
			{
				kind: "redis",
				databaseName: null,
				databaseUser: null,
				databasePassword: " ${ADMIN_PASSWORD} ",
			},
		],
		[
			"MySQL root password for the root user",
			{
				kind: "mysql",
				databaseUser: "root",
				databasePassword: "user-pass",
				databaseRootPassword: "${jwt_secret}",
			},
		],
		["appName", { appName: "${HOSTNAME}" }],
	])("excludes a database with a reference-like %s", (_label, overrides) => {
		const db = database(overrides);
		expect(classifyStudioDatabases([db], localStudio, [])).toEqual({
			covered: [],
			excluded: [{ database: db, reason: "reference-like-value" }],
			requiredNetworkIds: [],
		});
	});

	it("checks only the password the seed would carry", () => {
		const mysqlAppUser = database({
			id: "db-mysql-app",
			kind: "mysql",
			databaseUser: "app",
			databasePassword: "app-pass",
			databaseRootPassword: "${JWT_SECRET}",
		});
		const mysqlRoot = database({
			id: "db-mysql-root",
			kind: "mysql",
			databaseUser: "root",
			databasePassword: "${JWT_SECRET}",
			databaseRootPassword: "root-pass",
		});
		const mariadbRoot = database({
			id: "db-mariadb-root",
			kind: "mariadb",
			databaseUser: "root",
			databasePassword: "maria-pass",
			databaseRootPassword: "${JWT_SECRET}",
		});
		const coverage = classifyStudioDatabases(
			[mysqlAppUser, mysqlRoot, mariadbRoot],
			localStudio,
			[],
		);
		expect(coverage.covered).toEqual([mysqlAppUser, mysqlRoot, mariadbRoot]);
		expect(coverage.excluded).toEqual([]);
	});

	it("reports another server before a reference-like value", () => {
		const db = database({ serverId: "srv-b", databaseUser: "${JWT_SECRET}" });
		expect(classifyStudioDatabases([db], remoteStudio, []).excluded).toEqual([
			{ database: db, reason: "other-server" },
		]);
	});

	it("reports a reference-like value before a network problem", () => {
		const overridden = database({
			id: "db-override",
			hasNetworkSwarm: true,
			databaseUser: "${JWT_SECRET}",
		});
		const detached = database({
			id: "db-detached",
			detachDokployNetwork: true,
			databaseName: "${JWT_SECRET}",
		});
		expect(
			classifyStudioDatabases([overridden, detached], localStudio, []).excluded,
		).toEqual([
			{ database: overridden, reason: "reference-like-value" },
			{ database: detached, reason: "reference-like-value" },
		]);
	});

	it("excludes a database with a Swarm network override", () => {
		const db = database({ hasNetworkSwarm: true, networkIds: ["net-a"] });
		expect(
			classifyStudioDatabases([db], localStudio, [overlay("net-a")]),
		).toEqual({
			covered: [],
			excluded: [{ database: db, reason: "network-swarm-override" }],
			requiredNetworkIds: [],
		});
	});

	it("reports another server before a Swarm network override", () => {
		const db = database({ serverId: "srv-b", hasNetworkSwarm: true });
		expect(classifyStudioDatabases([db], remoteStudio, []).excluded).toEqual([
			{ database: db, reason: "other-server" },
		]);
	});

	it("excludes a detached database without networks", () => {
		const db = database({ detachDokployNetwork: true, networkIds: [] });
		expect(classifyStudioDatabases([db], localStudio, []).excluded).toEqual([
			{ database: db, reason: "no-network" },
		]);
	});

	it("covers a detached database through its overlay networks", () => {
		const db = database({
			detachDokployNetwork: true,
			networkIds: ["net-b", "net-a"],
		});
		expect(
			classifyStudioDatabases([db], localStudio, [
				overlay("net-a"),
				overlay("net-b"),
			]),
		).toEqual({
			covered: [db],
			excluded: [],
			requiredNetworkIds: ["net-a", "net-b"],
		});
	});

	it("covers a database on dokploy-network and adds its overlay networks", () => {
		const db = database({ networkIds: ["net-a"] });
		expect(
			classifyStudioDatabases([db], localStudio, [overlay("net-a")]),
		).toEqual({
			covered: [db],
			excluded: [],
			requiredNetworkIds: ["net-a"],
		});
	});

	it("unions the networks of covered databases, unique and sorted", () => {
		const first = database({ id: "db-1", networkIds: ["net-c", "net-a"] });
		const second = database({
			id: "db-2",
			detachDokployNetwork: true,
			networkIds: ["net-a", "net-b"],
		});
		const third = database({ id: "db-3" });
		const coverage = classifyStudioDatabases(
			[first, second, third],
			localStudio,
			[overlay("net-a"), overlay("net-b"), overlay("net-c")],
		);
		expect(coverage.covered).toEqual([first, second, third]);
		expect(coverage.requiredNetworkIds).toEqual(["net-a", "net-b", "net-c"]);
	});

	it("never requires the networks of excluded databases", () => {
		const elsewhere = database({
			id: "db-elsewhere",
			serverId: "srv-b",
			networkIds: ["net-a"],
		});
		const overridden = database({
			id: "db-override",
			hasNetworkSwarm: true,
			networkIds: ["net-a"],
		});
		const referenced = database({
			id: "db-referenced",
			databaseUser: "${JWT_SECRET}",
			networkIds: ["net-a"],
		});
		const coverage = classifyStudioDatabases(
			[elsewhere, overridden, referenced],
			localStudio,
			[overlay("net-a")],
		);
		expect(coverage.requiredNetworkIds).toEqual([]);
	});

	it("ignores networks whose driver is not overlay", () => {
		const attached = database({ id: "db-1", networkIds: ["net-bridge"] });
		const detached = database({
			id: "db-2",
			detachDokployNetwork: true,
			networkIds: ["net-bridge"],
		});
		const coverage = classifyStudioDatabases(
			[attached, detached],
			localStudio,
			[overlay("net-bridge", null, "bridge")],
		);
		expect(coverage.covered).toEqual([attached]);
		expect(coverage.excluded).toEqual([
			{ database: detached, reason: "no-network" },
		]);
		expect(coverage.requiredNetworkIds).toEqual([]);
	});

	it("ignores overlay networks of another server", () => {
		const db = database({
			serverId: "srv-a",
			detachDokployNetwork: true,
			networkIds: ["net-local", "net-a"],
		});
		const coverage = classifyStudioDatabases([db], remoteStudio, [
			overlay("net-local", null),
			overlay("net-a", "srv-a"),
		]);
		expect(coverage.covered).toEqual([db]);
		expect(coverage.requiredNetworkIds).toEqual(["net-a"]);

		const onlyForeign = database({
			serverId: "srv-a",
			detachDokployNetwork: true,
			networkIds: ["net-local"],
		});
		expect(
			classifyStudioDatabases([onlyForeign], remoteStudio, [
				overlay("net-local", null),
			]).excluded,
		).toEqual([{ database: onlyForeign, reason: "no-network" }]);
	});

	it("ignores network ids without a network row", () => {
		const db = database({ networkIds: ["net-deleted"] });
		expect(
			classifyStudioDatabases([db], localStudio, []).requiredNetworkIds,
		).toEqual([]);
	});

	it("ignores applicationStatus", () => {
		const idle = database({ id: "db-idle", applicationStatus: "idle" });
		const failed = database({ id: "db-error", applicationStatus: "error" });
		expect(
			classifyStudioDatabases([idle, failed], localStudio, []).covered,
		).toEqual([idle, failed]);
	});

	it("keeps the input order in both lists", () => {
		const a = database({ id: "a", serverId: "srv-b" });
		const b = database({ id: "b" });
		const c = database({ id: "c", detachDokployNetwork: true });
		const d = database({ id: "d" });
		const coverage = classifyStudioDatabases([a, b, c, d], localStudio, []);
		expect(coverage.covered.map((db) => db.id)).toEqual(["b", "d"]);
		expect(coverage.excluded.map((entry) => entry.database.id)).toEqual([
			"a",
			"c",
		]);
	});
});

describe("exclusionMessage", () => {
	it("names the other server", () => {
		expect(exclusionMessage("other-server", "worker-1")).toBe(
			"Runs on server worker-1. Set up a Studio on that server to manage it.",
		);
	});

	it("names the Dokploy server when the database runs on the Dokploy host", () => {
		expect(exclusionMessage("other-server", null)).toBe(
			"Runs on the Dokploy server. Set up a Studio on that server to manage it.",
		);
		expect(exclusionMessage("other-server")).toBe(
			"Runs on the Dokploy server. Set up a Studio on that server to manage it.",
		);
	});

	it("explains a reference-like value", () => {
		expect(exclusionMessage("reference-like-value")).toBe(
			"Has a user, database name or password that looks like a ${...} reference, which Studio could resolve from its own environment.",
		);
	});

	it("explains a Swarm network override", () => {
		expect(exclusionMessage("network-swarm-override")).toBe(
			"Uses a custom Swarm network override, so the Studio cannot join it automatically.",
		);
	});

	it("explains a database without networks", () => {
		expect(exclusionMessage("no-network")).toBe(
			"Is not attached to any network.",
		);
	});
});

describe("classify, then render a mixed set", () => {
	it("keeps reference-like values out of a seed that stays valid for the other databases", () => {
		const clean = database({ id: "db-clean" });
		const mysqlAppUser = database({
			id: "db-mysql-app",
			kind: "mysql",
			name: "Legacy MySQL",
			databaseName: "legacy",
			databaseUser: "app",
			databasePassword: "app-pass",
			databaseRootPassword: "${JWT_SECRET}",
		});
		const mariadbRoot = database({
			id: "db-mariadb-root",
			kind: "mariadb",
			name: "Shop MariaDB",
			databaseName: "shop",
			databaseUser: "root",
			databasePassword: "maria-pass",
			databaseRootPassword: "${JWT_SECRET}",
		});
		const userReference = database({
			id: "db-user",
			name: "User reference",
			databaseUser: "${JWT_SECRET}",
		});
		const nameReference = database({
			id: "db-name",
			kind: "mariadb",
			name: "Name reference",
			databaseName: "${vault:secret/data/studio#jwt}",
		});
		const passwordReference = database({
			id: "db-redis",
			kind: "redis",
			name: "Password reference",
			databaseName: null,
			databaseUser: null,
			databasePassword: " ${ADMIN_PASSWORD} ",
		});
		const rootReference = database({
			id: "db-mysql-root",
			kind: "mysql",
			name: "Root reference",
			databaseUser: "root",
			databasePassword: "user-pass",
			databaseRootPassword: "${jwt_secret}",
		});
		const hostReference = database({
			id: "db-libsql",
			kind: "libsql",
			name: "Host reference",
			appName: "${HOSTNAME}",
			databaseName: null,
			databaseUser: "libsql",
		});
		const references = [
			userReference,
			nameReference,
			passwordReference,
			rootReference,
			hostReference,
		];

		const coverage = classifyStudioDatabases(
			[
				clean,
				userReference,
				mysqlAppUser,
				nameReference,
				passwordReference,
				mariadbRoot,
				rootReference,
				hostReference,
			],
			localStudio,
			[],
		);
		expect(coverage.covered).toEqual([clean, mysqlAppUser, mariadbRoot]);
		expect(coverage.excluded).toEqual(
			references.map((db) => ({
				database: db,
				reason: "reference-like-value",
			})),
		);

		const config = renderSeedConfig(coverage.covered, labels);
		if (config === null) {
			throw new Error("expected a config");
		}
		expect(() => validateSeedConfig(config)).not.toThrow();
		const text = serializeSeedConfig(config);
		expect(text).not.toContain("${");
		expect(JSON.parse(text)).toEqual(config);
		expect(
			config.connections.map(({ name, user, password }) => [
				name,
				user,
				password,
			]),
		).toEqual([
			["Legacy MySQL", "app", "app-pass"],
			["Orders DB", "orders", "orders-pass"],
			["Shop MariaDB", "root", "maria-pass"],
		]);

		// The validator is the backstop: each excluded database, rendered on its
		// own, is refused.
		for (const db of references) {
			const leaked = renderSeedConfig([db], labels);
			if (leaked === null) {
				throw new Error("expected a config");
			}
			expect(() => validateSeedConfig(leaked)).toThrow(
				"Looks like a ${...} reference",
			);
		}
	});
});

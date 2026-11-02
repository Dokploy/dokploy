import {
	getBackupOverviewIcon,
	getServiceOverviewIcon,
} from "@dokploy/server/services/overview";
import { describe, expect, test } from "vitest";

describe("getServiceOverviewIcon", () => {
	test("returns a db icon for every known DB engine type", () => {
		for (const type of [
			"postgres",
			"mariadb",
			"mysql",
			"mongo",
			"redis",
			"libsql",
		] as const) {
			expect(getServiceOverviewIcon({ type, icon: null })).toEqual({
				kind: "db",
				engine: type,
			});
		}
	});

	test("returns a custom icon for application/compose with a service icon set", () => {
		expect(
			getServiceOverviewIcon({
				type: "application",
				icon: "data:image/png;base64,x",
			}),
		).toEqual({ kind: "custom", url: "data:image/png;base64,x" });
		expect(
			getServiceOverviewIcon({
				type: "compose",
				icon: "data:image/png;base64,y",
			}),
		).toEqual({ kind: "custom", url: "data:image/png;base64,y" });
	});

	test("falls back to a generic icon for application/compose without a service icon", () => {
		expect(getServiceOverviewIcon({ type: "application", icon: null })).toEqual(
			{
				kind: "generic",
				type: "application",
			},
		);
		expect(getServiceOverviewIcon({ type: "compose", icon: null })).toEqual({
			kind: "generic",
			type: "compose",
		});
	});
});

describe("getBackupOverviewIcon", () => {
	test("returns a db icon for a database backup with a known databaseType", () => {
		expect(
			getBackupOverviewIcon({
				databaseType: "postgres",
				serviceType: null,
				serviceOwnerType: "postgres",
			}),
		).toEqual({ kind: "db", engine: "postgres" });
	});

	test("returns a webServer icon for a web-server database backup", () => {
		expect(
			getBackupOverviewIcon({
				databaseType: "web-server",
				serviceType: null,
				serviceOwnerType: "web-server",
			}),
		).toEqual({ kind: "webServer" });
	});

	test("returns a db icon for a compose-type backup dumping a known DB engine", () => {
		expect(
			getBackupOverviewIcon({
				databaseType: "mysql",
				serviceType: null,
				serviceOwnerType: "compose",
			}),
		).toEqual({ kind: "db", engine: "mysql" });
	});

	test("returns a db icon for a volume backup of a known DB engine service", () => {
		expect(
			getBackupOverviewIcon({
				databaseType: null,
				serviceType: "mongo",
				serviceOwnerType: "mongo",
			}),
		).toEqual({ kind: "db", engine: "mongo" });
	});

	test("returns a generic application icon for a volume backup of an application", () => {
		expect(
			getBackupOverviewIcon({
				databaseType: null,
				serviceType: "application",
				serviceOwnerType: "application",
			}),
		).toEqual({ kind: "generic", type: "application" });
	});

	test("returns a generic compose icon for a volume backup of a compose service", () => {
		expect(
			getBackupOverviewIcon({
				databaseType: null,
				serviceType: "compose",
				serviceOwnerType: "compose",
			}),
		).toEqual({ kind: "generic", type: "compose" });
	});
});

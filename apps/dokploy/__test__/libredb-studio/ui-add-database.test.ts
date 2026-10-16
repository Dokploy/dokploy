import { describe, expect, test } from "vitest";
import {
	ADD_DATABASE_NO_IP_MESSAGE,
	ADD_DATABASE_STUDIO_CARD_CAPTION,
	ADD_DATABASE_STUDIO_CARD_LABEL,
	ADD_DATABASE_STUDIO_CARD_VALUE,
	ADD_DATABASE_STUDIO_NOTE,
	ADD_DATABASE_STUDIO_SWITCH_LABEL,
	getAddDatabaseStudioSection,
	getAddDatabaseStudioSwitch,
	getAddDatabaseTypeValue,
	PLAIN_HTTP_WARNING,
	shouldCloseAddDatabaseOnStudioInstall,
} from "@/components/dashboard/libredb-studio/utils";

const studios = [{ serverId: null }, { serverId: "server-1" }];

const base = {
	isCloud: false,
	canSetUp: true,
	serverId: null,
	studios,
	errorMessage: undefined,
} as const;

describe("getAddDatabaseStudioSection", () => {
	test("shows nothing on cloud or while the cloud flag is loading", () => {
		expect(getAddDatabaseStudioSection({ ...base, isCloud: true })).toEqual({
			kind: "none",
		});
		expect(
			getAddDatabaseStudioSection({ ...base, isCloud: undefined }),
		).toEqual({ kind: "none" });
	});

	test("shows nothing until a server is chosen", () => {
		expect(
			getAddDatabaseStudioSection({ ...base, serverId: undefined }),
		).toEqual({ kind: "none" });
	});

	test("reports a failed Studio lookup instead of guessing", () => {
		expect(
			getAddDatabaseStudioSection({
				...base,
				studios: undefined,
				errorMessage: "UNAUTHORIZED",
			}),
		).toEqual({ kind: "error", message: "UNAUTHORIZED" });
	});

	test("shows nothing while the Studios are loading", () => {
		expect(
			getAddDatabaseStudioSection({ ...base, studios: undefined }),
		).toEqual({ kind: "none" });
	});

	test("shows the note when a Studio covers the selected server, even without setup permissions", () => {
		expect(getAddDatabaseStudioSection(base)).toEqual({ kind: "note" });
		expect(
			getAddDatabaseStudioSection({
				...base,
				serverId: "server-1",
				canSetUp: false,
			}),
		).toEqual({ kind: "note" });
	});

	test("offers the switch when no Studio covers the selected server", () => {
		expect(
			getAddDatabaseStudioSection({ ...base, serverId: "server-2" }),
		).toEqual({ kind: "switch" });
		expect(getAddDatabaseStudioSection({ ...base, studios: [] })).toEqual({
			kind: "switch",
		});
	});

	test("hides the switch from users who may not create services and deployments", () => {
		expect(
			getAddDatabaseStudioSection({
				...base,
				serverId: "server-2",
				canSetUp: false,
			}),
		).toEqual({ kind: "none" });
	});
});

describe("getAddDatabaseStudioSwitch", () => {
	const generatedDescription = `Installs LibreDB Studio on a generated address after the database is created. ${PLAIN_HTTP_WARNING}`;

	test("is available once the server has an IP address", () => {
		expect(
			getAddDatabaseStudioSwitch({
				serverIp: "203.0.113.10",
				errorMessage: undefined,
			}),
		).toEqual({ available: true, description: generatedDescription });
	});

	test("stays unavailable while the IP address is still being checked", () => {
		expect(
			getAddDatabaseStudioSwitch({
				serverIp: undefined,
				errorMessage: undefined,
			}),
		).toEqual({ available: false, description: generatedDescription });
	});

	test("is unavailable without an IP address", () => {
		for (const serverIp of ["", "   ", null]) {
			expect(
				getAddDatabaseStudioSwitch({ serverIp, errorMessage: undefined }),
			).toEqual({ available: false, description: ADD_DATABASE_NO_IP_MESSAGE });
		}
	});

	test("is unavailable and shows the error when the IP address check fails", () => {
		expect(
			getAddDatabaseStudioSwitch({
				serverIp: undefined,
				errorMessage: "Server not found",
			}),
		).toEqual({
			available: false,
			description:
				"The IP address of this server could not be checked: Server not found",
		});
	});
});

describe("Add Database sentences", () => {
	test("keep the exact wording of the spec", () => {
		expect(ADD_DATABASE_STUDIO_NOTE).toBe(
			"This database will appear in LibreDB Studio automatically and can be opened there once it is deployed.",
		);
		expect(ADD_DATABASE_STUDIO_SWITCH_LABEL).toBe(
			"Also set up LibreDB Studio for this environment",
		);
		expect(ADD_DATABASE_NO_IP_MESSAGE).toBe(
			"This server has no IP address to build a generated domain from. Install LibreDB Studio with a custom domain from the LibreDB Studio card in this dialog instead.",
		);
	});
});

describe("getAddDatabaseTypeValue", () => {
	test("selects the Studio card while it is chosen, whatever the database type", () => {
		expect(getAddDatabaseTypeValue(true, "postgres")).toBe("libredb-studio");
		expect(getAddDatabaseTypeValue(true, "libsql")).toBe("libredb-studio");
	});

	test("selects the database type otherwise", () => {
		expect(getAddDatabaseTypeValue(false, "postgres")).toBe("postgres");
		expect(getAddDatabaseTypeValue(false, "redis")).toBe("redis");
	});
});

describe("Add Database Studio card", () => {
	test("has its value, label and caption", () => {
		expect(ADD_DATABASE_STUDIO_CARD_VALUE).toBe("libredb-studio");
		expect(ADD_DATABASE_STUDIO_CARD_LABEL).toBe("LibreDB Studio");
		expect(ADD_DATABASE_STUDIO_CARD_CAPTION).toBe("Database editor");
	});
});

describe("shouldCloseAddDatabaseOnStudioInstall", () => {
	test("closes the dialog while it is open on the LibreDB Studio card", () => {
		expect(
			shouldCloseAddDatabaseOnStudioInstall({
				open: true,
				studioSelected: true,
			}),
		).toBe(true);
	});

	test("leaves the dialog alone after it was closed or another card was chosen", () => {
		expect(
			shouldCloseAddDatabaseOnStudioInstall({
				open: false,
				studioSelected: true,
			}),
		).toBe(false);
		expect(
			shouldCloseAddDatabaseOnStudioInstall({
				open: true,
				studioSelected: false,
			}),
		).toBe(false);
		expect(
			shouldCloseAddDatabaseOnStudioInstall({
				open: false,
				studioSelected: false,
			}),
		).toBe(false);
	});
});

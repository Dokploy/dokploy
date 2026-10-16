import { LIBREDB_STUDIO_ICON_DATA_URL } from "@dokploy/server/utils/libredb-studio/icon";
import { describe, expect, test } from "vitest";
import {
	COOKIE_SETTING_WARNING,
	CUSTOM_CONNECTIONS_WARNING,
	getDatabaseHref,
	getStudioImageTag,
	getStudioOpenBlocker,
	getStudioStatusLabel,
	getSyncResultMessage,
	HTTP_ADDRESS_WARNING,
	isKnownLibreDBStudio,
	isLibreDBStudioIcon,
	STUDIO_NO_DOMAIN_REASON,
	STUDIO_REVOCATION_WARNING,
} from "@/components/dashboard/libredb-studio/utils";

describe("getStudioStatusLabel", () => {
	test("names every deploy status", () => {
		expect(getStudioStatusLabel("done")).toBe("Deployed");
		expect(getStudioStatusLabel("running")).toBe("Deploying");
		expect(getStudioStatusLabel("error")).toBe("Deploy failed");
		expect(getStudioStatusLabel("idle")).toBe("Stopped or not deployed");
	});
});

describe("getStudioOpenBlocker", () => {
	test("allows opening a running Studio with an address", () => {
		expect(
			getStudioOpenBlocker({
				applicationStatus: "done",
				url: "https://studio.example.com",
			}),
		).toBeNull();
	});

	test("blocks a Studio that is not running", () => {
		expect(
			getStudioOpenBlocker({
				applicationStatus: "running",
				url: "https://studio.example.com",
			}),
		).toBe("The Studio is not running");
	});

	test("blocks a running Studio without an address", () => {
		expect(getStudioOpenBlocker({ applicationStatus: "done", url: null })).toBe(
			STUDIO_NO_DOMAIN_REASON,
		);
	});
});

describe("getStudioImageTag", () => {
	test("returns the tag of a tagged image", () => {
		expect(getStudioImageTag("ghcr.io/libredb/libredb-studio:0.18.0")).toBe(
			"0.18.0",
		);
		expect(
			getStudioImageTag("localhost:5000/libredb-studio:platform-integration"),
		).toBe("platform-integration");
	});

	test("returns the digest of a pinned image", () => {
		expect(
			getStudioImageTag("ghcr.io/libredb/libredb-studio@sha256:0123abcd"),
		).toBe("sha256:0123abcd");
	});

	test("returns the whole reference when there is no tag", () => {
		expect(getStudioImageTag("localhost:5000/libredb-studio")).toBe(
			"localhost:5000/libredb-studio",
		);
	});
});

describe("getSyncResultMessage", () => {
	test("describes a changed and an unchanged seed file", () => {
		expect(
			getSyncResultMessage({ changed: true, networksChanged: false }),
		).toBe("Seed file updated.");
		expect(
			getSyncResultMessage({ changed: false, networksChanged: false }),
		).toBe("Seed file was already up to date.");
	});

	test("mentions that the running Studio was updated with the changed networks", () => {
		expect(getSyncResultMessage({ changed: true, networksChanged: true })).toBe(
			"Seed file updated. The Studio networks changed, and the running Studio was updated with them.",
		);
		expect(
			getSyncResultMessage({ changed: false, networksChanged: true }),
		).toBe(
			"Seed file was already up to date. The Studio networks changed, and the running Studio was updated with them.",
		);
	});
});

describe("getDatabaseHref", () => {
	test("links to the database page of the Studio environment", () => {
		expect(
			getDatabaseHref(
				{ projectId: "project-1", environmentId: "environment-1" },
				{ kind: "mongo", id: "mongo-1" },
			),
		).toBe(
			"/dashboard/project/project-1/environment/environment-1/services/mongo/mongo-1",
		);
	});
});

describe("Studio card sentences", () => {
	test("keep the exact wording of the spec", () => {
		expect(CUSTOM_CONNECTIONS_WARNING).toBe(
			"Allowing custom connections lets Studio users connect to any host this server can reach, including Dokploy's own database.",
		);
		expect(COOKIE_SETTING_WARNING).toBe(
			"Domain scheme changed: apply the cookie setting",
		);
		expect(HTTP_ADDRESS_WARNING).toBe(
			"This address uses plain HTTP, so your Studio session cookie travels unencrypted; use a domain with HTTPS for anything beyond a trusted network.",
		);
		expect(STUDIO_NO_DOMAIN_REASON).toBe(
			"The Studio has no domain. Add one in the Domains tab.",
		);
		expect(STUDIO_REVOCATION_WARNING).toBe(
			"Removing someone's access in Dokploy does not end a Studio session they already opened, which lasts up to 24 hours; disable their Studio account to cut it at once.",
		);
	});
});

describe("isLibreDBStudioIcon", () => {
	test("recognizes the icon install stores for a Studio", () => {
		expect(isLibreDBStudioIcon(LIBREDB_STUDIO_ICON_DATA_URL)).toBe(true);
	});

	test("rejects a missing or different icon", () => {
		expect(isLibreDBStudioIcon(null)).toBe(false);
		expect(isLibreDBStudioIcon(undefined)).toBe(false);
		expect(isLibreDBStudioIcon("")).toBe(false);
		expect(
			isLibreDBStudioIcon("data:image/svg+xml;base64,PHN2Zz48L3N2Zz4="),
		).toBe(false);
	});
});

describe("isKnownLibreDBStudio", () => {
	test("knows a Studio from an earlier answer or from its icon", () => {
		expect(
			isKnownLibreDBStudio({
				studio: { libredbStudioId: "studio-1" },
				icon: null,
			}),
		).toBe(true);
		expect(
			isKnownLibreDBStudio({
				studio: undefined,
				icon: LIBREDB_STUDIO_ICON_DATA_URL,
			}),
		).toBe(true);
	});

	test("does not treat any other application as a Studio", () => {
		expect(isKnownLibreDBStudio({ studio: undefined, icon: null })).toBe(false);
		expect(
			isKnownLibreDBStudio({
				studio: null,
				icon: "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
			}),
		).toBe(false);
	});
});

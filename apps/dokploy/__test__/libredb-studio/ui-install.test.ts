import { describe, expect, test } from "vitest";
import {
	buildStudioDomainInput,
	canSetUpLibreDBStudio,
	findStudioForServer,
	getCustomHostError,
	getStudioInstallerNote,
	getStudioServiceHref,
	isGeneratedDomainAvailable,
	LOCAL_SERVER_VALUE,
	NO_SERVER_IP_MESSAGE,
	PLAIN_HTTP_WARNING,
	resolveSelectedServerId,
	STUDIO_ACCESS_WARNING,
	STUDIO_MEMBER_INSTALL_NOTE,
	shouldResetStudioInstallOnOpen,
} from "@/components/dashboard/libredb-studio/utils";

describe("canSetUpLibreDBStudio", () => {
	test("allows a self-hosted user who may create services and deployments", () => {
		expect(
			canSetUpLibreDBStudio({
				isCloud: false,
				canCreateServices: true,
				canCreateDeployments: true,
			}),
		).toBe(true);
	});

	test("refuses on cloud and while the cloud flag is still loading", () => {
		expect(
			canSetUpLibreDBStudio({
				isCloud: true,
				canCreateServices: true,
				canCreateDeployments: true,
			}),
		).toBe(false);
		expect(
			canSetUpLibreDBStudio({
				isCloud: undefined,
				canCreateServices: true,
				canCreateDeployments: true,
			}),
		).toBe(false);
	});

	test("refuses without either create permission", () => {
		expect(
			canSetUpLibreDBStudio({
				isCloud: false,
				canCreateServices: false,
				canCreateDeployments: true,
			}),
		).toBe(false);
		expect(
			canSetUpLibreDBStudio({
				isCloud: false,
				canCreateServices: true,
				canCreateDeployments: undefined,
			}),
		).toBe(false);
	});
});

describe("resolveSelectedServerId", () => {
	test("returns a remote server id unchanged", () => {
		expect(resolveSelectedServerId("server-1", true)).toBe("server-1");
		expect(resolveSelectedServerId("server-1", false)).toBe("server-1");
	});

	test("maps the local option and an empty selection to the Dokploy server when it is allowed", () => {
		expect(resolveSelectedServerId(LOCAL_SERVER_VALUE, true)).toBeNull();
		expect(resolveSelectedServerId(null, true)).toBeNull();
		expect(resolveSelectedServerId(undefined, true)).toBeNull();
	});

	test("reports no selection when only remote servers are allowed", () => {
		expect(resolveSelectedServerId(LOCAL_SERVER_VALUE, false)).toBeUndefined();
		expect(resolveSelectedServerId(null, false)).toBeUndefined();
		expect(resolveSelectedServerId(undefined, false)).toBeUndefined();
	});
});

describe("findStudioForServer", () => {
	const studios = [
		{ libredbStudioId: "local", serverId: null },
		{ libredbStudioId: "remote", serverId: "server-1" },
	];

	test("finds the Studio of the Dokploy server and of a remote server", () => {
		expect(findStudioForServer(studios, null)?.libredbStudioId).toBe("local");
		expect(findStudioForServer(studios, "server-1")?.libredbStudioId).toBe(
			"remote",
		);
	});

	test("returns undefined for a server without a Studio or before the list loads", () => {
		expect(findStudioForServer(studios, "server-2")).toBeUndefined();
		expect(findStudioForServer(undefined, null)).toBeUndefined();
	});
});

describe("getStudioServiceHref", () => {
	test("links to the Studio application page", () => {
		expect(
			getStudioServiceHref({
				projectId: "project-1",
				environmentId: "environment-1",
				applicationId: "application-1",
			}),
		).toBe(
			"/dashboard/project/project-1/environment/environment-1/services/application/application-1",
		);
	});
});

describe("isGeneratedDomainAvailable", () => {
	test("needs a non-blank server IP", () => {
		expect(isGeneratedDomainAvailable("203.0.113.10")).toBe(true);
		expect(isGeneratedDomainAvailable("")).toBe(false);
		expect(isGeneratedDomainAvailable("   ")).toBe(false);
		expect(isGeneratedDomainAvailable(null)).toBe(false);
		expect(isGeneratedDomainAvailable(undefined)).toBe(false);
	});
});

describe("getCustomHostError", () => {
	test("accepts a valid host, also with surrounding spaces", () => {
		expect(getCustomHostError("studio.example.com")).toBeNull();
		expect(getCustomHostError("  studio.example.com  ")).toBeNull();
	});

	test("asks for a host when it is empty", () => {
		expect(getCustomHostError("")).toBe(
			"Enter the domain the Studio should answer on.",
		);
		expect(getCustomHostError("   ")).toBe(
			"Enter the domain the Studio should answer on.",
		);
	});

	test("rejects a host Let's Encrypt cannot certify", () => {
		expect(getCustomHostError("studio_db.example.com")).toBe(
			"Invalid domain name. Use only letters, numbers, hyphens and dots (e.g. example.com). Underscores are not allowed.",
		);
		expect(getCustomHostError("https://studio.example.com")).not.toBeNull();
	});
});

describe("buildStudioDomainInput", () => {
	test("builds the generated domain input without a host", () => {
		expect(buildStudioDomainInput("generated", "ignored.example.com")).toEqual({
			kind: "generated",
		});
	});

	test("builds the custom domain input with the trimmed host", () => {
		expect(buildStudioDomainInput("custom", "  studio.example.com ")).toEqual({
			kind: "custom",
			host: "studio.example.com",
		});
	});
});

describe("install dialog sentences", () => {
	test("keep the exact wording of the spec", () => {
		expect(PLAIN_HTTP_WARNING).toBe(
			"The generated address uses plain HTTP, so your Studio session cookie travels unencrypted; use a custom domain with HTTPS for anything beyond a trusted network.",
		);
		expect(STUDIO_ACCESS_WARNING).toBe(
			"Anyone who can open this Studio can use every database in this environment with the stored credentials.",
		);
		expect(NO_SERVER_IP_MESSAGE).toBe(
			"This server has no IP address to build a generated domain from. Use a custom domain.",
		);
	});
});

describe("getStudioInstallerNote", () => {
	test("tells a member that only owners and admins can change the Studio", () => {
		expect(getStudioInstallerNote("member")).toBe(
			"After it is installed, only owners and admins of the organization can change this Studio; you can open it and use Sync now.",
		);
		expect(getStudioInstallerNote("member")).toBe(STUDIO_MEMBER_INSTALL_NOTE);
	});

	test("shows nothing to an owner or an admin", () => {
		expect(getStudioInstallerNote("owner")).toBeNull();
		expect(getStudioInstallerNote("admin")).toBeNull();
	});

	test("shows nothing while the role is loading", () => {
		expect(getStudioInstallerNote(undefined)).toBeNull();
	});
});

describe("shouldResetStudioInstallOnOpen", () => {
	test("clears a failed or finished install when the dialog opens", () => {
		expect(shouldResetStudioInstallOnOpen({ open: true, pending: false })).toBe(
			true,
		);
	});

	test("keeps a running install so the reopened form shows it loading", () => {
		expect(shouldResetStudioInstallOnOpen({ open: true, pending: true })).toBe(
			false,
		);
	});

	test("leaves the install alone while the dialog is closed", () => {
		expect(
			shouldResetStudioInstallOnOpen({ open: false, pending: false }),
		).toBe(false);
		expect(shouldResetStudioInstallOnOpen({ open: false, pending: true })).toBe(
			false,
		);
	});
});

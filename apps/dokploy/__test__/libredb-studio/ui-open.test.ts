import { describe, expect, test } from "vitest";
import {
	assertLaunchUrl,
	DATABASE_NOT_COVERED_REASON,
	DATABASE_NOT_RUNNING_REASON,
	getOpenInStudioState,
	INVALID_LAUNCH_URL_MESSAGE,
	type LaunchTab,
	navigateLaunchTab,
	openLaunchTab,
	POPUP_BLOCKED_MESSAGE,
	STUDIO_NOT_RUNNING_REASON,
	type StudioForDatabase,
} from "@/components/dashboard/libredb-studio/utils";

const coveredDatabase: StudioForDatabase = {
	studio: {
		libredbStudioId: "studio-1",
		serverId: null,
		applicationStatus: "done",
	},
	seedId: "dokploy-postgres-0123456789ab",
	covered: true,
	reason: null,
	canInstall: false,
	databaseStatus: "done",
	environmentId: "environment-1",
	serverId: null,
};

const createTab = (events: string[]): LaunchTab => {
	const tab: LaunchTab = {
		opener: { name: "dokploy" },
		location: {
			replace: (url) => {
				events.push(`replace ${url} opener=${String(tab.opener)}`);
			},
		},
		close: () => {
			events.push("close");
		},
	};
	return tab;
};

describe("getOpenInStudioState", () => {
	test("is ready when the running Studio covers the running database", () => {
		expect(getOpenInStudioState(coveredDatabase)).toEqual({
			kind: "ready",
			libredbStudioId: "studio-1",
			connectionId: "dokploy-postgres-0123456789ab",
		});
	});

	test("asks to deploy or start an idle database first", () => {
		expect(
			getOpenInStudioState({ ...coveredDatabase, databaseStatus: "idle" }),
		).toEqual({ kind: "disabled", reason: DATABASE_NOT_RUNNING_REASON });
	});

	test("reports a Studio that is deploying, failed or stopped as not running", () => {
		for (const applicationStatus of ["running", "error", "idle"] as const) {
			expect(
				getOpenInStudioState({
					...coveredDatabase,
					studio: {
						libredbStudioId: "studio-1",
						serverId: null,
						applicationStatus,
					},
				}),
			).toEqual({ kind: "disabled", reason: STUDIO_NOT_RUNNING_REASON });
		}
	});

	test("shows the exclusion reason of a database the Studio of its server cannot reach", () => {
		expect(
			getOpenInStudioState({
				...coveredDatabase,
				covered: false,
				canInstall: true,
				reason:
					"Uses a custom Swarm network override, so the Studio cannot join it automatically.",
			}),
		).toEqual({
			kind: "disabled",
			reason:
				"Uses a custom Swarm network override, so the Studio cannot join it automatically.",
		});
	});

	test("falls back to a generic reason when an uncovered database has none", () => {
		expect(
			getOpenInStudioState({ ...coveredDatabase, covered: false }),
		).toEqual({ kind: "disabled", reason: DATABASE_NOT_COVERED_REASON });
	});

	test("offers the setup when no Studio exists and the user may install one", () => {
		expect(
			getOpenInStudioState({
				...coveredDatabase,
				studio: null,
				covered: false,
				canInstall: true,
				serverId: "server-1",
			}),
		).toEqual({
			kind: "setup",
			environmentId: "environment-1",
			serverId: "server-1",
		});
	});

	test("explains the reason, or hides the button, when the user may not install a Studio", () => {
		expect(
			getOpenInStudioState({
				...coveredDatabase,
				studio: null,
				covered: false,
				reason: "No LibreDB Studio runs in this environment.",
			}),
		).toEqual({
			kind: "disabled",
			reason: "No LibreDB Studio runs in this environment.",
		});
		expect(
			getOpenInStudioState({
				...coveredDatabase,
				studio: null,
				covered: false,
			}),
		).toEqual({ kind: "hidden" });
	});

	test("keeps using the last answer when a later refetch fails", () => {
		expect(getOpenInStudioState(coveredDatabase, "Failed to fetch")).toEqual({
			kind: "ready",
			libredbStudioId: "studio-1",
			connectionId: "dokploy-postgres-0123456789ab",
		});
	});

	test("hides the button while loading and shows a failed lookup", () => {
		expect(getOpenInStudioState(undefined)).toEqual({ kind: "hidden" });
		expect(getOpenInStudioState(undefined, "UNAUTHORIZED")).toEqual({
			kind: "disabled",
			reason: "UNAUTHORIZED",
		});
	});
});

describe("openLaunchTab", () => {
	test("opens a blank tab right away", () => {
		const calls: string[][] = [];
		const tab = createTab([]);
		const opened = openLaunchTab({
			open: (url, target) => {
				calls.push([url, target]);
				return tab;
			},
		});
		expect(opened).toBe(tab);
		expect(calls).toEqual([["about:blank", "_blank"]]);
	});

	test("returns null when the browser blocks the tab", () => {
		expect(openLaunchTab({ open: () => null })).toBeNull();
	});
});

describe("assertLaunchUrl", () => {
	test("accepts http and https launch addresses", () => {
		expect(assertLaunchUrl("https://studio.example.com/launch#token=abc")).toBe(
			"https://studio.example.com/launch#token=abc",
		);
		expect(
			assertLaunchUrl(
				"http://demo-shop-libredb-studio-a1b2c3-127-0-0-1.sslip.io/launch#token=abc",
			),
		).toBe(
			"http://demo-shop-libredb-studio-a1b2c3-127-0-0-1.sslip.io/launch#token=abc",
		);
	});

	test("rejects other schemes and malformed addresses", () => {
		expect(() => assertLaunchUrl("javascript:alert(1)")).toThrow(
			"The launch address is not an http or https URL.",
		);
		expect(() => assertLaunchUrl("data:text/html,hello")).toThrow(
			"The launch address is not an http or https URL.",
		);
		expect(() => assertLaunchUrl("/launch#token=abc")).toThrow(
			"The launch address is not an http or https URL.",
		);
	});
});

describe("navigateLaunchTab", () => {
	test("cuts the opener before it navigates the tab", () => {
		const events: string[] = [];
		const tab = createTab(events);
		navigateLaunchTab(tab, "https://studio.example.com/launch#token=abc");
		expect(tab.opener).toBeNull();
		expect(events).toEqual([
			"replace https://studio.example.com/launch#token=abc opener=null",
		]);
	});

	test("leaves the tab untouched when the address is not http or https", () => {
		const events: string[] = [];
		const tab = createTab(events);
		expect(() => navigateLaunchTab(tab, "javascript:alert(1)")).toThrow(
			"The launch address is not an http or https URL.",
		);
		expect(events).toEqual([]);
		expect(tab.opener).toEqual({ name: "dokploy" });
	});
});

describe("Open in LibreDB Studio sentences", () => {
	test("keep the exact wording of the spec", () => {
		expect(DATABASE_NOT_RUNNING_REASON).toBe(
			"Deploy or start the database first",
		);
		expect(STUDIO_NOT_RUNNING_REASON).toBe("The Studio is not running");
		expect(POPUP_BLOCKED_MESSAGE).toBe(
			"Your browser blocked the new tab. Allow pop-ups for this site and try again.",
		);
		expect(INVALID_LAUNCH_URL_MESSAGE).toBe(
			"The launch address is not an http or https URL.",
		);
	});
});

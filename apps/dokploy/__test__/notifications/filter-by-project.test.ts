import { filterNotificationsByProject } from "@dokploy/server/utils/notifications/utils";
import { describe, expect, it } from "vitest";

const orgWide = {
	id: "org-wide",
	scopedToProjects: false,
	notificationToProjects: [],
};
const scopedToA = {
	id: "scoped-a",
	scopedToProjects: true,
	notificationToProjects: [{ projectId: "project-a" }],
};
const scopedToAB = {
	id: "scoped-ab",
	scopedToProjects: true,
	notificationToProjects: [
		{ projectId: "project-a" },
		{ projectId: "project-b" },
	],
};
// Scoped notification whose only project was deleted (links cascaded away).
const scopedOrphan = {
	id: "scoped-orphan",
	scopedToProjects: true,
	notificationToProjects: [],
};

const all = [orgWide, scopedToA, scopedToAB, scopedOrphan];
const ids = (list: { id: string }[]) => list.map((n) => n.id);

describe("filterNotificationsByProject", () => {
	it("sends org-wide and matching scoped notifications", () => {
		expect(ids(filterNotificationsByProject(all, "project-a"))).toEqual([
			"org-wide",
			"scoped-a",
			"scoped-ab",
		]);
	});

	it("skips scoped notifications linked to other projects", () => {
		expect(ids(filterNotificationsByProject(all, "project-b"))).toEqual([
			"org-wide",
			"scoped-ab",
		]);
		expect(ids(filterNotificationsByProject(all, "project-c"))).toEqual([
			"org-wide",
		]);
	});

	it("never widens a scoped notification that lost all its projects", () => {
		expect(
			ids(filterNotificationsByProject([scopedOrphan], "project-a")),
		).toEqual([]);
	});

	it("only sends org-wide notifications for events without a project", () => {
		expect(ids(filterNotificationsByProject(all, undefined))).toEqual([
			"org-wide",
		]);
		expect(ids(filterNotificationsByProject(all, null))).toEqual(["org-wide"]);
	});
});

import { describe, expect, it } from "vitest";
import {
	environmentState,
	isInherited,
	projectState,
	serviceState,
	toggleEnvironment,
	toggleProject,
	toggleService,
} from "@/lib/permission-tree";

const env = (environmentId: string, ...serviceIds: string[]) => ({
	environmentId,
	services: serviceIds.map((id) => ({ id })),
});

const project = {
	projectId: "proj-1",
	environments: [
		env("env-prod", "svc-a", "svc-b", "svc-c"),
		env("env-dev", "svc-d"),
	],
};

const empty = { projects: [], environments: [], services: [] };

describe("toggleProject", () => {
	it("checking a project stores only the project", () => {
		expect(toggleProject(empty, project, true)).toEqual({
			projects: ["proj-1"],
			environments: [],
			services: [],
		});
	});

	it("checking a project clears its now-redundant descendants", () => {
		const selection = {
			projects: [],
			environments: ["env-prod"],
			services: ["svc-a", "svc-z"],
		};
		expect(toggleProject(selection, project, true)).toEqual({
			projects: ["proj-1"],
			environments: [],
			services: ["svc-z"],
		});
	});

	it("unchecking a project clears it and every descendant", () => {
		const selection = {
			projects: ["proj-1"],
			environments: ["env-prod"],
			services: ["svc-a", "svc-z"],
		};
		expect(toggleProject(selection, project, false)).toEqual({
			projects: [],
			environments: [],
			services: ["svc-z"],
		});
	});
});

describe("toggleService", () => {
	it("unchecking a service under a full-access project materialises two levels", () => {
		const selection = { projects: ["proj-1"], environments: [], services: [] };
		const result = toggleService(
			selection,
			project,
			project.environments[0]!,
			"svc-b",
			false,
		);

		expect(result.projects).toEqual([]);
		expect(result.environments).toEqual(["env-dev"]);
		expect(result.services.sort()).toEqual(["svc-a", "svc-c"]);
	});

	it("unchecking a service under a full-access environment materialises one level", () => {
		const selection = {
			projects: [],
			environments: ["env-prod"],
			services: [],
		};
		const result = toggleService(
			selection,
			project,
			project.environments[0]!,
			"svc-b",
			false,
		);

		expect(result.environments).toEqual([]);
		expect(result.services.sort()).toEqual(["svc-a", "svc-c"]);
	});

	it("checking a service adds it explicitly", () => {
		expect(
			toggleService(empty, project, project.environments[0]!, "svc-a", true),
		).toEqual({
			projects: [],
			environments: [],
			services: ["svc-a"],
		});
	});

	it("checking a service twice is idempotent", () => {
		const once = toggleService(
			empty,
			project,
			project.environments[0]!,
			"svc-a",
			true,
		);
		expect(
			toggleService(once, project, project.environments[0]!, "svc-a", true),
		).toEqual(once);
	});
});

describe("toggleEnvironment", () => {
	it("unchecking an environment under a full-access project keeps the siblings full-access", () => {
		const selection = { projects: ["proj-1"], environments: [], services: [] };
		const result = toggleEnvironment(
			selection,
			project,
			project.environments[0]!,
			false,
		);

		expect(result.projects).toEqual([]);
		expect(result.environments).toEqual(["env-dev"]);
		expect(result.services).toEqual([]);
	});

	it("checking an environment clears its redundant services", () => {
		const selection = { projects: [], environments: [], services: ["svc-a"] };
		expect(
			toggleEnvironment(selection, project, project.environments[0]!, true),
		).toEqual({
			projects: [],
			environments: ["env-prod"],
			services: [],
		});
	});
});

describe("node states", () => {
	it("a full-access project is checked and its descendants inherit", () => {
		const selection = { projects: ["proj-1"], environments: [], services: [] };
		expect(projectState(selection, project)).toBe("checked");
		expect(environmentState(selection, project, project.environments[0]!)).toBe(
			"checked",
		);
		expect(
			serviceState(selection, project, project.environments[0]!, "svc-a"),
		).toBe("checked");
		expect(isInherited(selection, project, project.environments[0]!)).toBe(
			true,
		);
	});

	it("a project holding explicit grants is indeterminate", () => {
		const selection = { projects: [], environments: [], services: ["svc-a"] };
		expect(projectState(selection, project)).toBe("indeterminate");
		expect(environmentState(selection, project, project.environments[0]!)).toBe(
			"indeterminate",
		);
		expect(environmentState(selection, project, project.environments[1]!)).toBe(
			"unchecked",
		);
		expect(isInherited(selection, project, project.environments[0]!)).toBe(
			false,
		);
	});

	it("an untouched project is unchecked", () => {
		expect(projectState(empty, project)).toBe("unchecked");
		expect(
			serviceState(empty, project, project.environments[0]!, "svc-a"),
		).toBe("unchecked");
	});
});

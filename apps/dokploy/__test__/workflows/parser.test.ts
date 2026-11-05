import {
	matchesPatterns,
	parseWorkflow,
	workflowMatchesEvent,
} from "@dokploy/server/utils/workflows/parser";
import { describe, expect, it } from "vitest";

const workflow = (on: string) => `
name: CI
on:
${on}
jobs:
  test:
    name: Run tests
    runs-on: ubuntu-latest
    steps:
      - run: echo hi
  build:
    runs-on: [self-hosted, linux]
    steps:
      - run: echo build
`;

describe("parseWorkflow", () => {
	it("reads name, jobs and trigger summary", () => {
		const parsed = parseWorkflow(
			workflow(`  push:
    branches: [main]
  pull_request:
    branches: [main]`),
			"ci.yml",
		);
		expect(parsed.name).toBe("CI");
		expect(parsed.jobs).toEqual([
			{ id: "test", name: "Run tests", runsOn: ["ubuntu-latest"] },
			{ id: "build", name: "build", runsOn: ["self-hosted", "linux"] },
		]);
		expect(parsed.triggerSummary).toEqual([
			{ event: "push", branches: ["main"] },
			{ event: "pull_request", branches: ["main"] },
		]);
	});

	it("accepts string and list forms of on", () => {
		expect(
			Object.keys(
				parseWorkflow("on: push\njobs:\n  a:\n    runs-on: x\n", "a.yml")
					.triggers,
			),
		).toEqual(["push"]);
		expect(
			Object.keys(
				parseWorkflow(
					"on: [push, pull_request, release]\njobs:\n  a:\n    runs-on: x\n",
					"a.yml",
				).triggers,
			),
		).toEqual(["push", "pull_request"]);
	});

	it("reads workflow_dispatch inputs", () => {
		const parsed = parseWorkflow(
			workflow(`  workflow_dispatch:
    inputs:
      environment:
        description: Target
        required: true
        type: choice
        options: [staging, production]
        default: staging`),
			"ci.yml",
		);
		expect(parsed.dispatchInputs).toEqual([
			{
				name: "environment",
				description: "Target",
				required: true,
				type: "choice",
				options: ["staging", "production"],
				default: "staging",
			},
		]);
	});

	it("falls back to the file name and rejects files without jobs", () => {
		expect(
			parseWorkflow("on: push\njobs:\n  a:\n    runs-on: x\n", "deploy.yml")
				.name,
		).toBe("deploy.yml");
		expect(() => parseWorkflow("on: push\n", "x.yml")).toThrow(/jobs/);
		expect(() => parseWorkflow("jobs:\n  a: {}\n", "x.yml")).toThrow(/on/);
	});
});

describe("matchesPatterns", () => {
	it("lets later negations exclude earlier matches", () => {
		expect(matchesPatterns("release/1.0", ["release/**", "!release/1.0"])).toBe(
			false,
		);
		expect(matchesPatterns("release/2.0", ["release/**", "!release/1.0"])).toBe(
			true,
		);
	});

	it("does not let a single star cross slashes", () => {
		expect(matchesPatterns("feature/a/b", ["feature/*"])).toBe(false);
		expect(matchesPatterns("feature/a/b", ["feature/**"])).toBe(true);
	});
});

describe("workflowMatchesEvent", () => {
	const triggers = (on: string) =>
		parseWorkflow(workflow(on), "ci.yml").triggers;

	it("filters pushes by branch", () => {
		const t = triggers("  push:\n    branches: [main]");
		expect(workflowMatchesEvent(t, { name: "push", branch: "main" })).toBe(
			true,
		);
		expect(workflowMatchesEvent(t, { name: "push", branch: "dev" })).toBe(
			false,
		);
	});

	it("does not run branch-filtered pushes for tags and vice versa", () => {
		const branches = triggers("  push:\n    branches: [main]");
		expect(
			workflowMatchesEvent(branches, { name: "push", tag: "v1.0.0" }),
		).toBe(false);
		const tags = triggers("  push:\n    tags: ['v*']");
		expect(workflowMatchesEvent(tags, { name: "push", tag: "v1.0.0" })).toBe(
			true,
		);
		expect(workflowMatchesEvent(tags, { name: "push", branch: "main" })).toBe(
			false,
		);
	});

	it("runs unfiltered pushes for branches and tags", () => {
		const t = triggers("  push: {}");
		expect(workflowMatchesEvent(t, { name: "push", branch: "any" })).toBe(true);
		expect(workflowMatchesEvent(t, { name: "push", tag: "v1" })).toBe(true);
	});

	it("applies branches-ignore", () => {
		const t = triggers("  push:\n    branches-ignore: ['docs/**']");
		expect(workflowMatchesEvent(t, { name: "push", branch: "docs/x" })).toBe(
			false,
		);
		expect(workflowMatchesEvent(t, { name: "push", branch: "main" })).toBe(
			true,
		);
	});

	it("applies paths and paths-ignore", () => {
		const paths = triggers("  push:\n    paths: ['src/**']");
		expect(
			workflowMatchesEvent(paths, {
				name: "push",
				branch: "main",
				changedFiles: ["README.md"],
			}),
		).toBe(false);
		expect(
			workflowMatchesEvent(paths, {
				name: "push",
				branch: "main",
				changedFiles: ["README.md", "src/index.ts"],
			}),
		).toBe(true);
		expect(workflowMatchesEvent(paths, { name: "push", branch: "main" })).toBe(
			true,
		);

		const ignore = triggers("  push:\n    paths-ignore: ['docs/**']");
		expect(
			workflowMatchesEvent(ignore, {
				name: "push",
				branch: "main",
				changedFiles: ["docs/a.md"],
			}),
		).toBe(false);
		expect(
			workflowMatchesEvent(ignore, {
				name: "push",
				branch: "main",
				changedFiles: ["docs/a.md", "src/a.ts"],
			}),
		).toBe(true);
	});

	it("filters pull requests by base branch and default types", () => {
		const t = triggers("  pull_request:\n    branches: [main]");
		expect(
			workflowMatchesEvent(t, {
				name: "pull_request",
				action: "opened",
				baseBranch: "main",
			}),
		).toBe(true);
		expect(
			workflowMatchesEvent(t, {
				name: "pull_request",
				action: "closed",
				baseBranch: "main",
			}),
		).toBe(false);
		expect(
			workflowMatchesEvent(t, {
				name: "pull_request",
				action: "synchronize",
				baseBranch: "dev",
			}),
		).toBe(false);
	});

	it("honours explicit pull request types", () => {
		const t = triggers("  pull_request:\n    types: [closed]");
		expect(
			workflowMatchesEvent(t, {
				name: "pull_request",
				action: "closed",
				baseBranch: "main",
			}),
		).toBe(true);
		expect(
			workflowMatchesEvent(t, {
				name: "pull_request",
				action: "opened",
				baseBranch: "main",
			}),
		).toBe(false);
	});

	it("never matches events the workflow does not listen to", () => {
		const t = triggers("  workflow_dispatch: {}");
		expect(workflowMatchesEvent(t, { name: "push", branch: "main" })).toBe(
			false,
		);
	});
});

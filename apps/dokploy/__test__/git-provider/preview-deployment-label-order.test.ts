import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	type PreviewCandidateApp,
	partitionPreviewApps,
	pullRequestMatchesPreviewLabels,
} from "../../utils/preview-deployment";

describe("pullRequestMatchesPreviewLabels", () => {
	it("matches every PR when the app configures no labels", () => {
		expect(pullRequestMatchesPreviewLabels(undefined, [{ name: "any" }])).toBe(
			true,
		);
		expect(pullRequestMatchesPreviewLabels(null, [{ name: "any" }])).toBe(true);
		expect(pullRequestMatchesPreviewLabels([], [{ name: "any" }])).toBe(true);
	});

	it("matches when the PR carries at least one configured label", () => {
		expect(
			pullRequestMatchesPreviewLabels(
				["preview"],
				[{ name: "dependencies" }, { name: "preview" }],
			),
		).toBe(true);
	});

	it("does not match when the PR carries none of the configured labels", () => {
		expect(
			pullRequestMatchesPreviewLabels(
				["preview"],
				[{ name: "dependencies" }, { name: "renovate" }],
			),
		).toBe(false);
	});

	it("does not match when a gate is configured but the PR is unlabeled", () => {
		expect(pullRequestMatchesPreviewLabels(["preview"], [])).toBe(false);
		expect(pullRequestMatchesPreviewLabels(["preview"], null)).toBe(false);
		expect(pullRequestMatchesPreviewLabels(["preview"], undefined)).toBe(false);
	});
});

describe("partitionPreviewApps", () => {
	beforeEach(() => {
		// Reset spy history, then capture the audit logs the helper emits so we
		// can assert on them while keeping the test output clean.
		vi.restoreAllMocks();
		vi.spyOn(console, "warn").mockImplementation(() => {});
		vi.spyOn(console, "log").mockImplementation(() => {});
		vi.spyOn(console, "error").mockImplementation(() => {});
	});

	const pullRequest = {
		owner: "acme",
		repository: "web-app",
		prAuthor: "dependency-bot[bot]",
		prNumber: 42,
		action: "opened",
	};

	const app = (
		overrides: Partial<PreviewCandidateApp> & { name: string },
	): PreviewCandidateApp => ({
		previewLabels: ["preview"],
		previewRequireCollaboratorPermissions: true,
		...overrides,
	});

	const grants = (permission: string) =>
		vi.fn().mockResolvedValue({ hasWriteAccess: true, permission });
	const denies = (permission: string | null = "none") =>
		vi.fn().mockResolvedValue({ hasWriteAccess: false, permission });

	it("skips the permission check for PRs that fail the label filter (issue #4902)", async () => {
		const resolveAuthorPermission = denies();

		const decision = await partitionPreviewApps({
			apps: [app({ name: "docs", previewLabels: ["preview"] })],
			// A renovate PR carries none of the configured labels.
			pullRequestLabels: [{ name: "dependencies" }, { name: "renovate" }],
			...pullRequest,
			resolveAuthorPermission,
		});

		expect(resolveAuthorPermission).not.toHaveBeenCalled();
		expect(decision.authorizedApps).toHaveLength(0);
		// No blocked apps => the handler posts no security comment.
		expect(decision.blockedAppNames).toEqual([]);
	});

	it("authorizes a label-matched app when the author has write access", async () => {
		const decision = await partitionPreviewApps({
			apps: [app({ name: "docs" })],
			pullRequestLabels: [{ name: "preview" }],
			...pullRequest,
			resolveAuthorPermission: grants("write"),
		});

		expect(decision.authorizedApps.map((a) => a.name)).toEqual(["docs"]);
		expect(decision.blockedAppNames).toEqual([]);
		expect(decision.authorPermission).toBe("write");
	});

	it("blocks a label-matched app when the author lacks write access", async () => {
		const decision = await partitionPreviewApps({
			apps: [app({ name: "docs" })],
			pullRequestLabels: [{ name: "preview" }],
			...pullRequest,
			resolveAuthorPermission: denies("read"),
		});

		expect(decision.authorizedApps).toHaveLength(0);
		expect(decision.blockedAppNames).toEqual(["docs"]);
		expect(decision.authorPermission).toBe("read");
	});

	it("still enforces permissions for apps without a label gate", async () => {
		const resolveAuthorPermission = denies();

		const decision = await partitionPreviewApps({
			apps: [app({ name: "docs", previewLabels: null })],
			pullRequestLabels: [{ name: "dependencies" }],
			...pullRequest,
			resolveAuthorPermission,
		});

		expect(resolveAuthorPermission).toHaveBeenCalledTimes(1);
		expect(decision.blockedAppNames).toEqual(["docs"]);
	});

	it("skips the permission check when it is explicitly disabled", async () => {
		const resolveAuthorPermission = denies();

		const decision = await partitionPreviewApps({
			apps: [
				app({ name: "docs", previewRequireCollaboratorPermissions: false }),
			],
			pullRequestLabels: [{ name: "preview" }],
			...pullRequest,
			resolveAuthorPermission,
		});

		expect(resolveAuthorPermission).not.toHaveBeenCalled();
		expect(decision.authorizedApps.map((a) => a.name)).toEqual(["docs"]);
	});

	it("fails closed and blocks the app when the permission check throws", async () => {
		const decision = await partitionPreviewApps({
			apps: [app({ name: "docs" })],
			pullRequestLabels: [{ name: "preview" }],
			...pullRequest,
			resolveAuthorPermission: vi
				.fn()
				.mockRejectedValue(new Error("GitHub API error")),
		});

		expect(decision.authorizedApps).toHaveLength(0);
		expect(decision.blockedAppNames).toEqual(["docs"]);
	});

	it("partitions a mix of apps in a single webhook delivery", async () => {
		// Only the maintainer's app has write access.
		const resolveAuthorPermission = vi.fn(async (candidate) =>
			candidate.name === "authorized"
				? { hasWriteAccess: true, permission: "admin" }
				: { hasWriteAccess: false, permission: "none" },
		);

		const decision = await partitionPreviewApps({
			apps: [
				app({ name: "unlabeled", previewLabels: ["preview"] }), // filtered by labels
				app({ name: "authorized", previewLabels: ["deploy"] }), // write access
				app({ name: "denied", previewLabels: ["deploy"] }), // no write access
				app({ name: "no-gate", previewLabels: null }), // always checked
			],
			pullRequestLabels: [{ name: "deploy" }],
			...pullRequest,
			resolveAuthorPermission,
		});

		expect(decision.authorizedApps.map((a) => a.name)).toEqual(["authorized"]);
		expect(decision.blockedAppNames).toEqual(["denied", "no-gate"]);
		// The label-mismatched app is never permission-checked.
		expect(
			resolveAuthorPermission.mock.calls.map(([candidate]) => candidate.name),
		).not.toContain("unlabeled");
	});

	describe("logs a traceable reason for every decision", () => {
		it("logs why a preview is skipped, naming the PR and the label mismatch", async () => {
			await partitionPreviewApps({
				apps: [app({ name: "docs", previewLabels: ["preview"] })],
				pullRequestLabels: [{ name: "dependencies" }],
				...pullRequest,
				resolveAuthorPermission: denies(),
			});

			expect(console.log).toHaveBeenCalledWith(
				expect.stringContaining(
					'Preview SKIPPED for "docs" — PR #42 (opened) by dependency-bot[bot] on acme/web-app',
				),
			);
			expect(console.log).toHaveBeenCalledWith(
				expect.stringContaining(
					"[dependencies] do not match required [preview]",
				),
			);
		});

		it("logs why a preview is blocked, naming the PR and the permission", async () => {
			await partitionPreviewApps({
				apps: [app({ name: "docs" })],
				pullRequestLabels: [{ name: "preview" }],
				...pullRequest,
				resolveAuthorPermission: denies("read"),
			});

			expect(console.warn).toHaveBeenCalledWith(
				expect.stringContaining(
					'Preview BLOCKED for "docs" — PR #42 (opened) by dependency-bot[bot] on acme/web-app: author lacks write access (permission: read)',
				),
			);
		});

		it("logs why a preview is accepted, naming the PR and the permission", async () => {
			await partitionPreviewApps({
				apps: [app({ name: "docs" })],
				pullRequestLabels: [{ name: "preview" }],
				...pullRequest,
				resolveAuthorPermission: grants("admin"),
			});

			expect(console.log).toHaveBeenCalledWith(
				expect.stringContaining(
					'Preview ACCEPTED for "docs" — PR #42 (opened) by dependency-bot[bot] on acme/web-app: author has write access (permission: admin)',
				),
			);
		});
	});
});

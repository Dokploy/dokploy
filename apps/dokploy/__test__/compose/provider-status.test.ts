import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUpdateCompose = vi.hoisted(() => vi.fn());

vi.mock("@dokploy/server/services/permission", () => ({
	checkServicePermissionAndAccess: vi.fn(async () => undefined),
}));

vi.mock("@dokploy/server", () => ({
	IS_CLOUD: true,
	findComposeById: vi.fn(async () => ({
		composeId: "compose-1",
		name: "example-compose",
	})),
	updateCompose: mockUpdateCompose,
}));

vi.mock("@dokploy/server/lib/auth", () => ({
	validateRequest: vi.fn(),
}));

vi.mock("@/server/api/utils/audit", () => ({
	audit: vi.fn(async () => undefined),
}));

vi.mock("@/server/queues/queueSetup", () => ({
	cleanQueuesByCompose: vi.fn(),
	killDockerBuild: vi.fn(),
	myQueue: {
		add: vi.fn(),
	},
}));

const { composeRouter } = await import("@/server/api/routers/compose");

const caller = composeRouter.createCaller({
	session: { activeOrganizationId: "org-1" },
	user: { id: "user-1", email: "user@example.com", role: "owner" },
} as Parameters<typeof composeRouter.createCaller>[0]);

const providerForms = [
	["GitHub", "save-github-provider-compose.tsx"],
	["GitLab", "save-gitlab-provider-compose.tsx"],
	["Bitbucket", "save-bitbucket-provider-compose.tsx"],
	["Gitea", "save-gitea-provider-compose.tsx"],
	["custom Git", "save-git-provider-compose.tsx"],
] as const;

describe("saving a compose provider", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it.each(providerForms)(
		"does not reset the status when saving %s settings",
		(_provider, filename) => {
			const source = readFileSync(
				new URL(
					`../../components/dashboard/compose/general/generic/${filename}`,
					import.meta.url,
				),
				"utf8",
			);

			expect(source).not.toMatch(/composeStatus\s*:\s*["']idle["']/);
		},
	);

	it.each(["done", "running"])(
		"keeps the %s status when disconnecting a Git provider",
		async (status) => {
			let savedStatus = status;
			mockUpdateCompose.mockImplementation(async (_id, update) => {
				if (update.composeStatus !== undefined) {
					savedStatus = update.composeStatus;
				}
			});

			await caller.disconnectGitProvider({ composeId: "compose-1" });

			expect(savedStatus).toBe(status);
			expect(mockUpdateCompose).toHaveBeenCalledTimes(1);
			expect(mockUpdateCompose).toHaveBeenCalledWith(
				"compose-1",
				expect.objectContaining({ sourceType: "github" }),
			);
		},
	);
});

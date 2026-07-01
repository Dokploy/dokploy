import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	aiFindFirst: vi.fn(),
	delete: vi.fn(),
	deleteWhere: vi.fn(),
	insert: vi.fn(),
	insertValues: vi.fn(),
	onConflictDoUpdate: vi.fn(),
	returning: vi.fn(),
}));

vi.mock("@dokploy/server/db", () => ({
	db: {
		delete: mocks.delete,
		insert: mocks.insert,
		query: {
			ai: {
				findFirst: mocks.aiFindFirst,
			},
		},
	},
}));

const { deleteAiSettings, getAiSettingById, saveAiSettings } = await import(
	"@dokploy/server/services/ai"
);

const aiSettings = {
	aiId: "ai-1",
	apiKey: "secret",
	apiUrl: "https://api.openai.com/v1",
	createdAt: "2026-06-23T00:00:00.000Z",
	isEnabled: true,
	model: "gpt-4o-mini",
	name: "OpenAI",
	organizationId: "org-2",
};

describe("AI settings organization boundary", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.aiFindFirst.mockResolvedValue(aiSettings);
		mocks.delete.mockReturnValue({
			where: mocks.deleteWhere,
		});
		mocks.deleteWhere.mockResolvedValue(true);
		mocks.insert.mockReturnValue({
			values: mocks.insertValues,
		});
		mocks.insertValues.mockReturnValue({
			onConflictDoUpdate: mocks.onConflictDoUpdate,
		});
		mocks.onConflictDoUpdate.mockReturnValue({
			returning: mocks.returning,
		});
		mocks.returning.mockResolvedValue([
			{ ...aiSettings, organizationId: "org-1" },
		]);
	});

	it("does not return AI settings from another organization", async () => {
		await expect(getAiSettingById("ai-1", "org-1")).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
	});

	it("rejects updating another organization's AI settings by aiId", async () => {
		await expect(
			saveAiSettings("org-1", {
				aiId: "ai-1",
				apiKey: "new-secret",
				apiUrl: "https://api.openai.com/v1",
				isEnabled: true,
				model: "gpt-4o-mini",
				name: "OpenAI",
			}),
		).rejects.toMatchObject({
			code: "NOT_FOUND",
		});

		expect(mocks.insert).not.toHaveBeenCalled();
	});

	it("preserves an existing API key when update receives the redacted sentinel", async () => {
		mocks.aiFindFirst.mockResolvedValue({
			...aiSettings,
			organizationId: "org-1",
		});

		await expect(
			saveAiSettings("org-1", {
				aiId: "ai-1",
				apiKey: "__DOKPLOY_REDACTED_SECRET__",
				apiUrl: "https://api.openai.com/v1",
				isEnabled: true,
				model: "gpt-4o-mini",
				name: "OpenAI",
			}),
		).resolves.toMatchObject({ aiId: "ai-1" });

		expect(mocks.onConflictDoUpdate).toHaveBeenCalledWith(
			expect.objectContaining({
				set: expect.not.objectContaining({
					apiKey: "__DOKPLOY_REDACTED_SECRET__",
				}),
			}),
		);
	});

	it("rejects deleting another organization's AI settings by aiId", async () => {
		await expect(deleteAiSettings("ai-1", "org-1")).rejects.toMatchObject({
			code: "NOT_FOUND",
		});

		expect(mocks.delete).not.toHaveBeenCalled();
	});
});

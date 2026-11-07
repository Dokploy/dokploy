import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	service: {} as Record<string, unknown>,
	sync: vi.fn(),
}));

vi.mock("@dokploy/server/db", () => {
	const database = {
		query: {
			applications: { findFirst: async () => state.service },
			compose: { findFirst: async () => state.service },
		},
		update: () => ({
			set: (value: Record<string, unknown>) => ({
				where: () => ({
					returning: async () => {
						Object.assign(state.service, value);
						return [{ ...state.service }];
					},
				}),
			}),
		}),
		execute: vi.fn(),
	};
	return {
		db: {
			...database,
			transaction: async (callback: (tx: typeof database) => unknown) =>
				callback(database),
		},
	};
});
vi.mock(
	"@dokploy/server/services/azure-devops-hooks",
	async (importOriginal) => ({
		...(await importOriginal<object>()),
		syncAzureDevopsWebhook: state.sync,
	}),
);

import { updateApplication } from "@dokploy/server/services/application";
import { updateCompose } from "@dokploy/server/services/compose";

beforeEach(() => {
	vi.clearAllMocks();
	state.service = {
		sourceType: "azureDevops",
		azureDevopsId: "provider",
		refreshToken: "original-token",
	};
});

describe.each([
	{ type: "application", update: updateApplication },
	{ type: "compose", update: updateCompose },
])("$type webhook tokens", ({ type, update }) => {
	it("rotates the token when disconnecting Azure", async () => {
		const result = await update("service", {
			sourceType: "github",
			azureDevopsId: null,
		});
		expect(result?.refreshToken).not.toBe("original-token");
		expect(result?.refreshToken).toEqual(expect.any(String));
		expect(state.sync).toHaveBeenCalledWith(type, "service");
	});
	it.each(["github", "gitlab", "bitbucket", "gitea", "git"] as const)(
		"rotates the token when switching from Azure to %s",
		async (sourceType) => {
			const result = await update("service", { sourceType });
			expect(result?.refreshToken).not.toBe("original-token");
			expect(result?.azureDevopsId).toBeNull();
		},
	);
	it("rotates the token when switching Azure providers", async () => {
		const result = await update("service", { azureDevopsId: "other-provider" });
		expect(result?.refreshToken).not.toBe("original-token");
	});
	it("keeps the token when saving the same Azure provider", async () => {
		const result = await update("service", {
			sourceType: "azureDevops",
			azureDevopsId: "provider",
		});
		expect(result?.refreshToken).toBe("original-token");
	});
	it.each(["github", "gitlab", "bitbucket", "gitea", "git"] as const)(
		"keeps the token when disconnecting or changing a %s source",
		async (sourceType) => {
			for (const change of [
				{ sourceType: "git" as const },
				{ sourceType: "github" as const, azureDevopsId: null },
			]) {
				state.service.sourceType = sourceType;
				state.service.azureDevopsId = null;
				const result = await update("service", change);
				expect(result?.refreshToken).toBe("original-token");
			}
		},
	);
});

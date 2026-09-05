import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	updatedRow: {
		registryId: "reg-1",
		registryName: "AWS ECR",
		username: "AWS",
		password: "dXNlcm5hbWU6cGFzc3dvcmQ=",
		registryUrl: "123456789.dkr.ecr.us-east-1.amazonaws.com",
		registryType: "cloud",
		imagePrefix: null,
		organizationId: "org-1",
	} as Record<string, unknown>,
	execAsync: vi.fn(),
	execAsyncRemote: vi.fn(),
	transaction: vi.fn(),
	txUpdate: vi.fn(),
	txUpdateSet: vi.fn(),
	txUpdateWhere: vi.fn(),
	txUpdateReturning: vi.fn(),
	cloud: { IS_CLOUD: false },
}));

const DEFAULT_ROW = { ...mocks.updatedRow };

vi.mock("@dokploy/server/db", () => {
	const chain = {
		set: mocks.txUpdateSet,
		where: mocks.txUpdateWhere,
		returning: mocks.txUpdateReturning,
	};
	mocks.txUpdateSet.mockReturnValue(chain);
	mocks.txUpdateWhere.mockReturnValue(chain);
	mocks.txUpdateReturning.mockImplementation(() =>
		Promise.resolve([mocks.updatedRow]),
	);
	mocks.txUpdate.mockReturnValue(chain);
	mocks.transaction.mockImplementation(
		async (cb: (tx: unknown) => Promise<unknown>) =>
			cb({ update: mocks.txUpdate }),
	);
	return {
		db: { transaction: mocks.transaction, update: mocks.txUpdate },
	};
});

vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	execAsync: mocks.execAsync,
	execAsyncRemote: mocks.execAsyncRemote,
}));

vi.mock("@dokploy/server/constants", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("@dokploy/server/constants")>();
	return {
		...actual,
		get IS_CLOUD() {
			return mocks.cloud.IS_CLOUD;
		},
	};
});

import {
	safeDockerLoginCommand,
	updateRegistry,
} from "@dokploy/server/services/registry";

const wireChain = () => {
	const chain = {
		set: mocks.txUpdateSet,
		where: mocks.txUpdateWhere,
		returning: mocks.txUpdateReturning,
	};
	mocks.txUpdateSet.mockReturnValue(chain);
	mocks.txUpdateWhere.mockReturnValue(chain);
	mocks.txUpdateReturning.mockImplementation(() =>
		Promise.resolve([mocks.updatedRow]),
	);
	mocks.txUpdate.mockReturnValue(chain);
	mocks.transaction.mockImplementation(
		async (cb: (tx: unknown) => Promise<unknown>) =>
			cb({ update: mocks.txUpdate }),
	);
};

const expectedLoginCommand = () =>
	safeDockerLoginCommand(
		mocks.updatedRow.registryUrl as string,
		mocks.updatedRow.username as string,
		mocks.updatedRow.password as string,
	);

beforeEach(() => {
	vi.clearAllMocks();
	wireChain();
	mocks.execAsync.mockResolvedValue({ stdout: "", stderr: "" });
	mocks.execAsyncRemote.mockResolvedValue({ stdout: "", stderr: "" });
	mocks.cloud.IS_CLOUD = false;
	Object.assign(mocks.updatedRow, DEFAULT_ROW);
});

describe("updateRegistry", () => {
	it("succeeds without running docker login when serverId is falsy in cloud mode (untouched Server dropdown)", async () => {
		mocks.cloud.IS_CLOUD = true;

		const result = await updateRegistry("reg-1", {
			username: "AWS",
			registryUrl: "123456789.dkr.ecr.us-east-1.amazonaws.com",
			registryType: "cloud",
			serverId: "",
		});

		expect(mocks.transaction).toHaveBeenCalledTimes(1);
		expect(mocks.txUpdate).toHaveBeenCalledTimes(1);
		expect(mocks.execAsync).not.toHaveBeenCalled();
		expect(mocks.execAsyncRemote).not.toHaveBeenCalled();
		expect(result).toEqual(mocks.updatedRow);
	});

	it("runs docker login locally when the user explicitly selects 'None' in cloud mode", async () => {
		mocks.cloud.IS_CLOUD = true;

		await updateRegistry("reg-1", {
			registryType: "cloud",
			serverId: "none",
		});

		expect(mocks.execAsync).toHaveBeenCalledTimes(1);
		expect(mocks.execAsync).toHaveBeenCalledWith(expectedLoginCommand());
		expect(mocks.execAsyncRemote).not.toHaveBeenCalled();
	});

	it("runs docker login on the selected remote server in cloud mode", async () => {
		mocks.cloud.IS_CLOUD = true;

		await updateRegistry("reg-1", {
			registryType: "cloud",
			serverId: "server-42",
		});

		expect(mocks.execAsyncRemote).toHaveBeenCalledTimes(1);
		expect(mocks.execAsyncRemote).toHaveBeenCalledWith(
			"server-42",
			expectedLoginCommand(),
		);
		expect(mocks.execAsync).not.toHaveBeenCalled();
	});

	it("runs docker login locally for a falsy serverId when self-hosted (no shared control plane)", async () => {
		const result = await updateRegistry("reg-1", {
			registryType: "cloud",
			serverId: "",
		});

		expect(mocks.execAsync).toHaveBeenCalledTimes(1);
		expect(mocks.execAsync).toHaveBeenCalledWith(expectedLoginCommand());
		expect(mocks.execAsyncRemote).not.toHaveBeenCalled();
		expect(result).toEqual(mocks.updatedRow);
	});

	it("builds the login command from the post-update DB row (keep-existing-password flow)", async () => {
		mocks.cloud.IS_CLOUD = false;
		Object.assign(mocks.updatedRow, { password: "kept-existing-secret" });

		await updateRegistry("reg-1", {
			registryType: "cloud",
			serverId: "none",
		});

		const cmd = mocks.execAsync.mock.calls[0]?.[0] as string;
		expect(cmd).toContain("kept-existing-secret");
		expect(
			safeDockerLoginCommand(
				"123456789.dkr.ecr.us-east-1.amazonaws.com",
				"AWS",
				"kept-existing-secret",
			),
		).toBe(cmd);
	});

	it("throws a BAD_REQUEST TRPCError with the password redacted when docker login fails", async () => {
		mocks.cloud.IS_CLOUD = false;
		const password = mocks.updatedRow.password as string;
		mocks.execAsync.mockRejectedValueOnce(
			new Error(`login failed for ${password}`),
		);

		await expect(
			updateRegistry("reg-1", { registryType: "cloud", serverId: "none" }),
		).rejects.toMatchObject({
			code: "BAD_REQUEST",
			message: "login failed for ***",
		});

		expect(mocks.execAsync).toHaveBeenCalledTimes(1);
	});

	it("runs the update inside db.transaction so a failed docker login rolls back the credential row", async () => {
		mocks.cloud.IS_CLOUD = false;
		mocks.execAsync.mockRejectedValueOnce(new Error("login failed"));

		await expect(
			updateRegistry("reg-1", { registryType: "cloud", serverId: "none" }),
		).rejects.toBeInstanceOf(TRPCError);

		expect(mocks.transaction).toHaveBeenCalledTimes(1);
	});
});

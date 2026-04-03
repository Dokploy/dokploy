import { describe, expect, it } from "vitest";
import {
	extractBranchName,
	extractCommitMessage,
	extractHash,
	getProviderByHeader,
} from "@/pages/api/deploy/[refreshToken]";

describe("Soft Serve Webhook", () => {
	const mockSoftServeHeaders = {
		"x-softserve-event": "push",
	};

	const createMockBody = (message: string, hash: string, branch: string) => ({
		event: "push",
		ref: `refs/heads/${branch}`,
		after: hash,
		commits: [{ message: message }],
	});
	const message: string = "feat: add new feature";
	const hash: string = "3c91c24ef9560bddc695bce138bf8a7094ec3df5";
	const branch: string = "feat/add-new";
	const goodWebhook = createMockBody(message, hash, branch);

	it("should properly extract the provider name", () => {
		expect(getProviderByHeader(mockSoftServeHeaders)).toBe("soft-serve");
	});

	it("should properly extract the commit message", () => {
		expect(extractCommitMessage(mockSoftServeHeaders, goodWebhook)).toBe(
			message,
		);
	});

	it("should properly extract hash", () => {
		expect(extractHash(mockSoftServeHeaders, goodWebhook)).toBe(hash);
	});

	it("should properly extract branch name", () => {
		expect(extractBranchName(mockSoftServeHeaders, goodWebhook)).toBe(branch);
	});

	it("should gracefully handle invalid webhook", () => {
		expect(getProviderByHeader({})).toBeNull();
		expect(extractCommitMessage(mockSoftServeHeaders, {})).toBe("NEW COMMIT");
		expect(extractHash(mockSoftServeHeaders, {})).toBe("NEW COMMIT");
		expect(extractBranchName(mockSoftServeHeaders, {})).toBeNull();
	});
});

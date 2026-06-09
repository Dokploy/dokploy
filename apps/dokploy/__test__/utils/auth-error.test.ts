import { TRPCClientError } from "@trpc/client";
import { describe, expect, test } from "vitest";
import {
	isUnauthorizedError,
	shouldRedirectOnAuthError,
} from "@/utils/auth-error";

const makeUnauthorizedError = () => {
	const error = new TRPCClientError("Unauthorized");
	(error as any).data = { code: "UNAUTHORIZED" };
	return error;
};

const makeForbiddenError = () => {
	const error = new TRPCClientError("Forbidden");
	(error as any).data = { code: "FORBIDDEN" };
	return error;
};

describe("isUnauthorizedError", () => {
	test("returns true for a TRPCClientError with UNAUTHORIZED code", () => {
		expect(isUnauthorizedError(makeUnauthorizedError())).toBe(true);
	});

	test("returns false for a TRPCClientError with a different code", () => {
		expect(isUnauthorizedError(makeForbiddenError())).toBe(false);
	});

	test("returns false for a plain Error", () => {
		expect(isUnauthorizedError(new Error("UNAUTHORIZED"))).toBe(false);
	});

	test("returns false for null", () => {
		expect(isUnauthorizedError(null)).toBe(false);
	});

	test("returns false for undefined", () => {
		expect(isUnauthorizedError(undefined)).toBe(false);
	});
});

describe("shouldRedirectOnAuthError", () => {
	test("returns false for public paths even with an unauthorized error", () => {
		const error = makeUnauthorizedError();
		expect(shouldRedirectOnAuthError("/", error)).toBe(false);
		expect(shouldRedirectOnAuthError("/register", error)).toBe(false);
		expect(shouldRedirectOnAuthError("/invitation/abc", error)).toBe(false);
	});

	test("returns true for a protected path with an unauthorized error", () => {
		expect(
			shouldRedirectOnAuthError(
				"/dashboard/project/abc",
				makeUnauthorizedError(),
			),
		).toBe(true);
	});

	test("returns false for a protected path with a non-auth error", () => {
		expect(
			shouldRedirectOnAuthError("/dashboard/project/abc", makeForbiddenError()),
		).toBe(false);
		expect(
			shouldRedirectOnAuthError("/dashboard/project/abc", new Error("nope")),
		).toBe(false);
	});
});

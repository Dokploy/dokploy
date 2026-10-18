import { SESSION_EXPIRED_MESSAGE } from "@/server/api/auth-constants";
import {
	isSessionExpiredError,
	shouldRedirectOnAuthError,
} from "@/utils/auth-error";
import { TRPCClientError } from "@trpc/client";
import { describe, expect, test } from "vitest";

const makeSessionExpiredError = () => {
	const error = new TRPCClientError(SESSION_EXPIRED_MESSAGE);
	(error as any).data = { code: "UNAUTHORIZED" };
	return error;
};

// UNAUTHORIZED, but from a permission/role check on a still-valid session.
const makePermissionDeniedError = () => {
	const error = new TRPCClientError("You don't have access to this project");
	(error as any).data = { code: "UNAUTHORIZED" };
	return error;
};

const makeForbiddenError = () => {
	const error = new TRPCClientError("Forbidden");
	(error as any).data = { code: "FORBIDDEN" };
	return error;
};

describe("isSessionExpiredError", () => {
	test("returns true for an UNAUTHORIZED error tagged as session-expired", () => {
		expect(isSessionExpiredError(makeSessionExpiredError())).toBe(true);
	});

	// Regression for #4310: the API reuses UNAUTHORIZED for permission denials
	// on authenticated users; those must NOT be treated as session expiry.
	test("returns false for a permission-denied UNAUTHORIZED error", () => {
		expect(isSessionExpiredError(makePermissionDeniedError())).toBe(false);
	});

	test("returns false for a different code", () => {
		expect(isSessionExpiredError(makeForbiddenError())).toBe(false);
	});

	test("returns false for a plain Error / null / undefined", () => {
		expect(isSessionExpiredError(new Error(SESSION_EXPIRED_MESSAGE))).toBe(false);
		expect(isSessionExpiredError(null)).toBe(false);
		expect(isSessionExpiredError(undefined)).toBe(false);
	});
});

describe("shouldRedirectOnAuthError", () => {
	test("returns false on public paths even with a session-expired error", () => {
		const error = makeSessionExpiredError();
		expect(shouldRedirectOnAuthError("/", error)).toBe(false);
		expect(shouldRedirectOnAuthError("/register", error)).toBe(false);
		expect(shouldRedirectOnAuthError("/invitation/abc", error)).toBe(false);
		expect(shouldRedirectOnAuthError("/accept-invitation/abc", error)).toBe(
			false,
		);
		expect(shouldRedirectOnAuthError("/reset-password", error)).toBe(false);
		expect(shouldRedirectOnAuthError("/send-reset-password", error)).toBe(false);
	});

	test("returns true for a protected path with a session-expired error", () => {
		expect(
			shouldRedirectOnAuthError(
				"/dashboard/project/abc",
				makeSessionExpiredError(),
			),
		).toBe(true);
	});

	test("returns false for a protected path with a permission-denied error", () => {
		expect(
			shouldRedirectOnAuthError(
				"/dashboard/project/abc",
				makePermissionDeniedError(),
			),
		).toBe(false);
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

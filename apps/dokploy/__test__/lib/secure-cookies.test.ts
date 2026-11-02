import { describe, expect, it } from "vitest";
import { isHttpsRequest, secureSetCookie } from "@/lib/secure-cookies";

describe("isHttpsRequest", () => {
	it("returns true when X-Forwarded-Proto is https", () => {
		expect(isHttpsRequest("https")).toBe(true);
	});

	it("returns false for http or a missing header", () => {
		expect(isHttpsRequest("http")).toBe(false);
		expect(isHttpsRequest(undefined)).toBe(false);
	});

	it("uses the left-most value of a proxy chain", () => {
		expect(isHttpsRequest("https, http")).toBe(true);
		expect(isHttpsRequest("http, https")).toBe(false);
	});

	it("handles an array header value and is case-insensitive", () => {
		expect(isHttpsRequest(["HTTPS", "http"])).toBe(true);
	});
});

describe("secureSetCookie", () => {
	it("adds Secure to a cookie that lacks it", () => {
		expect(
			secureSetCookie("better-auth.session_token=abc; Path=/; HttpOnly"),
		).toBe("better-auth.session_token=abc; Path=/; HttpOnly; Secure");
	});

	it("does not duplicate Secure when already present", () => {
		const cookie = "better-auth.session_token=abc; Path=/; Secure; HttpOnly";
		expect(secureSetCookie(cookie)).toBe(cookie);
	});

	it("applies to every cookie in an array", () => {
		expect(secureSetCookie(["a=1; Path=/", "b=2; Path=/; Secure"])).toEqual([
			"a=1; Path=/; Secure",
			"b=2; Path=/; Secure",
		]);
	});

	it("passes a numeric header value through untouched", () => {
		expect(secureSetCookie(123)).toBe(123);
	});
});

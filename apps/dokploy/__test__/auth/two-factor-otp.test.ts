import React from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
	defaultPasteTransformer,
	InputOTP,
	InputOTPGroup,
	InputOTPSeparator,
	InputOTPSlot,
	sanitizeTotpCode,
} from "@/components/ui/input-otp";
import { createTotpVerificationHandler } from "@/lib/totp-verification";

describe("2FA InputOTP Component & Password Manager Autofill", () => {
	describe("Password Manager Accessibility & Structure", () => {
		it("renders with pointer-events-none on groups, slots, and separators for elementFromPoint hit-testing", () => {
			const html = renderToString(
				React.createElement(InputOTP, {
					maxLength: 6,
					value: "",
					onChange: () => {},
					children: [
						React.createElement(
							InputOTPGroup,
							{ key: "g1" },
							React.createElement(InputOTPSlot, { index: 0 }),
							React.createElement(InputOTPSlot, { index: 1 }),
							React.createElement(InputOTPSlot, { index: 2 }),
						),
						React.createElement(InputOTPSeparator, { key: "sep" }),
						React.createElement(
							InputOTPGroup,
							{ key: "g2" },
							React.createElement(InputOTPSlot, { index: 3 }),
							React.createElement(InputOTPSlot, { index: 4 }),
							React.createElement(InputOTPSlot, { index: 5 }),
						),
					],
				}),
			);

			expect(html).toContain('data-slot="input-otp-group"');
			expect(html).toContain("pointer-events-none");
			expect(html).toContain('data-slot="input-otp-slot"');
			expect(html).toContain('data-slot="input-otp-separator"');
		});

		it("defaults to autoComplete='one-time-code', inputMode='numeric', and pushPasswordManagerStrategy='none'", () => {
			const html = renderToString(
				React.createElement(InputOTP, {
					maxLength: 6,
					value: "",
					onChange: () => {},
					children: null,
				}),
			);

			expect(html).toContain('autoComplete="one-time-code"');
			expect(html).toContain('inputMode="numeric"');
			// pushPasswordManagerStrategy='none' ensures no clip-path or width-stretching hacks
			expect(html).not.toContain("clip-path");
		});

		it("allows overriding autoComplete or inputMode when explicitly provided", () => {
			const html = renderToString(
				React.createElement(InputOTP, {
					maxLength: 6,
					value: "",
					onChange: () => {},
					autoComplete: "off",
					inputMode: "text",
					children: null,
				}),
			);

			expect(html).toContain('autoComplete="off"');
			expect(html).toContain('inputMode="text"');
		});
	});

	describe("Paste & Formatting Sanitization (Production Code)", () => {
		it("sanitizes codes with spaces (common in Bitwarden and authenticators)", () => {
			expect(defaultPasteTransformer("123 456")).toBe("123456");
			expect(defaultPasteTransformer(" 123  456 ")).toBe("123456");
			expect(sanitizeTotpCode("123 456")).toBe("123456");
		});

		it("sanitizes codes with hyphens or brackets", () => {
			expect(defaultPasteTransformer("123-456")).toBe("123456");
			expect(defaultPasteTransformer("[123456]")).toBe("123456");
			expect(sanitizeTotpCode("123-456")).toBe("123456");
		});

		it("preserves clean 6-digit numeric input", () => {
			expect(defaultPasteTransformer("654321")).toBe("654321");
			expect(sanitizeTotpCode("654321")).toBe("654321");
		});

		it("strips alphabetical noise from clipboard pastes", () => {
			expect(defaultPasteTransformer("Code: 987 654")).toBe("987654");
			expect(sanitizeTotpCode("Code: 987 654")).toBe("987654");
		});
	});

	describe("Auto-submit & De-duplication Verification Logic (Production Code)", () => {
		function setupVerificationTest() {
			let isLoading = false;
			const verifyCalls: string[] = [];
			let mockVerify = vi.fn(
				async (
					_code: string,
				): Promise<{ error?: { message?: string } | null }> => ({
					error: null,
				}),
			);

			const handler = createTotpVerificationHandler({
				verifyTotp: async (code) => {
					verifyCalls.push(code);
					return mockVerify(code);
				},
				isLoading: () => isLoading,
				setIsLoading: (val) => {
					isLoading = val;
				},
			});

			return {
				handler,
				verifyCalls,
				getIsLoading: () => isLoading,
				setMockVerify: (fn: typeof mockVerify) => {
					mockVerify = fn;
				},
			};
		}

		it("automatically triggers verification when 6 digits are reached", async () => {
			const { handler, verifyCalls } = setupVerificationTest();
			let currentCode = "";
			const setCode = (val: string) => {
				currentCode = val;
			};

			handler.handleInputChange("12345", setCode);
			expect(currentCode).toBe("12345");
			expect(verifyCalls.length).toBe(0);

			handler.handleInputChange("123456", setCode);
			expect(currentCode).toBe("123456");
			expect(verifyCalls).toEqual(["123456"]);
		});

		it("de-duplicates identical triggers from onChange and onComplete", async () => {
			const { handler, verifyCalls } = setupVerificationTest();
			let currentCode = "";
			const setCode = (val: string) => {
				currentCode = val;
			};

			// Simulate password manager filling 6 digits (triggers onChange and onComplete concurrently)
			handler.handleInputChange("987654", setCode);
			await handler.handleVerify("987654");

			expect(currentCode).toBe("987654");
			expect(verifyCalls.length).toBe(1);
			expect(verifyCalls[0]).toBe("987654");
		});

		it("does not trigger verification for codes shorter than 6 digits", async () => {
			const { handler, verifyCalls } = setupVerificationTest();

			await handler.handleVerify("123");
			await handler.handleVerify("12345");

			expect(verifyCalls.length).toBe(0);
		});

		it("clears submission guard on verification error to allow re-entry", async () => {
			const { handler, verifyCalls, setMockVerify } = setupVerificationTest();
			let currentCode = "";
			const setCode = (val: string) => {
				currentCode = val;
			};

			setMockVerify(
				vi.fn(async () => ({
					error: { message: "Invalid 2FA code" },
				})),
			);

			// First attempt with incorrect code
			handler.handleInputChange("000000", setCode);
			// Wait for async verification to complete
			await new Promise((r) => setTimeout(r, 10));
			expect(handler.getSubmittedCode()).toBeNull();

			// User fixes the code to the correct one
			setMockVerify(vi.fn(async () => ({ error: null })));
			handler.handleInputChange("111111", setCode);
			await new Promise((r) => setTimeout(r, 10));

			expect(verifyCalls).toContain("111111");
		});

		it("clears submission guard when user backspaces so they can re-type the 6th digit", async () => {
			const { handler, verifyCalls } = setupVerificationTest();
			let currentCode = "";
			const setCode = (val: string) => {
				currentCode = val;
			};

			handler.handleInputChange("123456", setCode);
			await new Promise((r) => setTimeout(r, 10));
			expect(handler.getSubmittedCode()).toBe("123456");

			// User deletes last digit
			handler.handleInputChange("12345", setCode);
			expect(handler.getSubmittedCode()).toBeNull();

			// User enters 6th digit again
			handler.handleInputChange("123456", setCode);
			await new Promise((r) => setTimeout(r, 10));
			expect(verifyCalls.length).toBe(2);
		});
	});
});

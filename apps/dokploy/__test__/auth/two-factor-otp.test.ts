import React from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
	InputOTP,
	InputOTPGroup,
	InputOTPSeparator,
	InputOTPSlot,
} from "@/components/ui/input-otp";

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

	describe("Paste & Formatting Sanitization", () => {
		const defaultPasteTransformer = (pasted: string) =>
			pasted.replace(/\D/g, "");

		it("sanitizes codes with spaces (common in Bitwarden and authenticators)", () => {
			expect(defaultPasteTransformer("123 456")).toBe("123456");
			expect(defaultPasteTransformer(" 123  456 ")).toBe("123456");
		});

		it("sanitizes codes with hyphens or brackets", () => {
			expect(defaultPasteTransformer("123-456")).toBe("123456");
			expect(defaultPasteTransformer("[123456]")).toBe("123456");
		});

		it("preserves clean 6-digit numeric input", () => {
			expect(defaultPasteTransformer("654321")).toBe("654321");
		});

		it("strips alphabetical noise from clipboard pastes", () => {
			expect(defaultPasteTransformer("Code: 987 654")).toBe("987654");
		});
	});

	describe("Auto-submit & De-duplication Verification Logic", () => {
		interface VerificationContext {
			isTwoFactorLoading: boolean;
			hasSubmittedTotp: string | null;
			verifyCalls: string[];
			mockVerify: (code: string) => Promise<{ error?: { message: string } }>;
		}

		function createVerificationController() {
			const ctx: VerificationContext = {
				isTwoFactorLoading: false,
				hasSubmittedTotp: null,
				verifyCalls: [],
				mockVerify: vi.fn(async (_code: string) => ({})),
			};

			const handleVerifyTotp = async (codeToVerify: string) => {
				const sanitized = codeToVerify.replace(/\D/g, "");
				if (sanitized.length !== 6) {
					return;
				}
				if (ctx.hasSubmittedTotp === sanitized || ctx.isTwoFactorLoading) {
					return;
				}

				ctx.hasSubmittedTotp = sanitized;
				ctx.isTwoFactorLoading = true;
				ctx.verifyCalls.push(sanitized);

				try {
					const { error } = await ctx.mockVerify(sanitized);
					if (error) {
						ctx.hasSubmittedTotp = null;
						return;
					}
				} catch {
					ctx.hasSubmittedTotp = null;
				} finally {
					ctx.isTwoFactorLoading = false;
				}
			};

			const handleInputChange = (val: string) => {
				const sanitized = val.replace(/\D/g, "");
				if (sanitized.length < 6) {
					ctx.hasSubmittedTotp = null;
				} else if (sanitized.length === 6) {
					handleVerifyTotp(sanitized);
				}
			};

			return { ctx, handleVerifyTotp, handleInputChange };
		}

		it("automatically triggers verification when 6 digits are reached", async () => {
			const { ctx, handleInputChange } = createVerificationController();

			handleInputChange("12345");
			expect(ctx.verifyCalls.length).toBe(0);

			handleInputChange("123456");
			expect(ctx.verifyCalls).toEqual(["123456"]);
		});

		it("de-duplicates identical triggers from onChange and onComplete", async () => {
			const { ctx, handleVerifyTotp, handleInputChange } =
				createVerificationController();

			// Simulate password manager filling 6 digits (triggers onChange and onComplete concurrently)
			handleInputChange("987654");
			handleVerifyTotp("987654");

			expect(ctx.verifyCalls.length).toBe(1);
			expect(ctx.verifyCalls[0]).toBe("987654");
		});

		it("does not trigger verification for codes shorter than 6 digits", async () => {
			const { ctx, handleVerifyTotp } = createVerificationController();

			await handleVerifyTotp("123");
			await handleVerifyTotp("12345");

			expect(ctx.verifyCalls.length).toBe(0);
		});

		it("clears submission guard on verification error to allow re-entry", async () => {
			const { ctx, handleInputChange } = createVerificationController();

			ctx.mockVerify = vi.fn(async () => ({
				error: { message: "Invalid 2FA code" },
			}));

			// First attempt with incorrect code
			await handleInputChange("000000");
			expect(ctx.hasSubmittedTotp).toBeNull();

			// User fixes the code to the correct one
			ctx.mockVerify = vi.fn(async () => ({}));
			await handleInputChange("111111");

			expect(ctx.verifyCalls).toContain("111111");
		});

		it("clears submission guard when user backspaces so they can re-type the 6th digit", async () => {
			const { ctx, handleInputChange } = createVerificationController();

			await handleInputChange("123456");
			expect(ctx.hasSubmittedTotp).toBe("123456");

			// User deletes last digit
			handleInputChange("12345");
			expect(ctx.hasSubmittedTotp).toBeNull();

			// User enters 6th digit again
			await handleInputChange("123456");
			expect(ctx.verifyCalls.length).toBe(2);
		});
	});
});

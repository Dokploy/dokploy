import { isDisposableEmail } from "@dokploy/server/utils/disposable-email";
import { describe, expect, it } from "vitest";

describe("isDisposableEmail", () => {
	it.each([
		"user@mailinator.com",
		"user@sub.mailinator.com",
		"User@YOPMAIL.COM",
		"user@10minutemail.com",
		"user@guerrillamail.com",
		" user@temp-mail.org ",
	])("blocks %s", async (email) => {
		expect(await isDisposableEmail(email)).toBe(true);
	});

	it.each([
		"user@gmail.com",
		"user+tag@gmail.com",
		"user@dokploy.com",
		"first.last@company.co.uk",
		"josé@company.com",
		"user@münchen.de",
	])("allows %s", async (email) => {
		expect(await isDisposableEmail(email)).toBe(false);
	});
});

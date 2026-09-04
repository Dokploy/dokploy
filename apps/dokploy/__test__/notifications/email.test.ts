import { apiCreateEmail } from "@dokploy/server/db/schema";
import { sendEmailNotification } from "@dokploy/server/utils/notifications/utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { createTransport, sendMail } = vi.hoisted(() => ({
	createTransport: vi.fn(),
	sendMail: vi.fn(),
}));

vi.mock("nodemailer", () => ({
	default: { createTransport },
}));

const emailConnection = {
	emailId: "email-id",
	smtpServer: "2001:db8::1",
	smtpPort: 465,
	tlsServerName: "smtp.example.com",
	username: "username",
	password: "password",
	fromAddress: "dokploy@example.com",
	toAddresses: ["operator@example.com"],
};

describe("email notifications TLS server name (#4649)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		createTransport.mockReturnValue({ sendMail });
		sendMail.mockResolvedValue(undefined);
	});

	it("preserves an optional TLS server name in the email API schema", () => {
		const result = apiCreateEmail.parse({
			...emailConnection,
			name: "Operations",
			appDeploy: false,
			appBuildError: false,
			databaseBackup: false,
			dokployBackup: false,
			volumeBackup: false,
			dokployRestart: false,
			dockerCleanup: false,
			serverThreshold: false,
		});

		expect(result.tlsServerName).toBe("smtp.example.com");
	});

	it("keeps the TLS server name optional for existing email notifications", () => {
		const result = apiCreateEmail.safeParse({
			...emailConnection,
			tlsServerName: undefined,
			name: "Operations",
			appDeploy: false,
			appBuildError: false,
			databaseBackup: false,
			dokployBackup: false,
			volumeBackup: false,
			dokployRestart: false,
			dockerCleanup: false,
			serverThreshold: false,
		});

		expect(result.success).toBe(true);
	});

	it("uses the configured TLS server name for SMTP certificate verification", async () => {
		await sendEmailNotification(emailConnection, "Subject", "<p>Body</p>");

		expect(createTransport).toHaveBeenCalledWith({
			host: "2001:db8::1",
			port: 465,
			auth: { user: "username", pass: "password" },
			tls: { servername: "smtp.example.com" },
		});
	});

	it("does not add TLS options when no server name is configured", async () => {
		await sendEmailNotification(
			{ ...emailConnection, tlsServerName: undefined },
			"Subject",
			"<p>Body</p>",
		);

		expect(createTransport).toHaveBeenCalledWith({
			host: "2001:db8::1",
			port: 465,
			auth: { user: "username", pass: "password" },
		});
	});
});

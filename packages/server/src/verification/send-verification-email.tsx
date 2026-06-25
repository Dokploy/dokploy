import { renderAsync } from "@react-email/components";
import InvitationEmail from "../emails/emails/invitation";
import VerifyEmailTemplate from "../emails/emails/verify-email";
import { sendEmailNotification } from "../utils/notifications/utils";

export const sendEmail = async ({
	email,
	subject,
	text,
	attachments,
}: {
	email: string;
	subject: string;
	text: string;
	attachments?: { filename: string; content: Buffer }[];
}) => {
	await sendEmailNotification(
		{
			fromAddress: process.env.SMTP_FROM_ADDRESS || "",
			toAddresses: [email],
			smtpServer: process.env.SMTP_SERVER || "",
			smtpPort: Number(process.env.SMTP_PORT),
			username: process.env.SMTP_USERNAME || "",
			password: process.env.SMTP_PASSWORD || "",
		},
		subject,
		text,
		attachments,
	);

	return true;
};

export const sendVerificationEmail = async ({
	userName,
	email,
	verificationUrl,
}: {
	userName: string;
	email: string;
	verificationUrl: string;
}) => {
	const html = await renderAsync(
		VerifyEmailTemplate({
			userName: userName || "User",
			verificationUrl,
		}),
	);
	await sendEmail({
		email,
		subject: "Verify your email",
		text: html,
	});
};

export const renderInvitationEmail = async ({
	email,
	inviteLink,
	organizationName,
}: {
	email: string;
	inviteLink: string;
	organizationName: string;
}) => {
	return renderAsync(
		InvitationEmail({
			inviteLink,
			toEmail: email,
			organizationName,
		}),
	);
};

export const sendInvitationEmail = async ({
	email,
	inviteLink,
	organizationName,
}: {
	email: string;
	inviteLink: string;
	organizationName: string;
}) => {
	const html = await renderInvitationEmail({
		email,
		inviteLink,
		organizationName,
	});
	await sendEmail({
		email,
		subject: `You've been invited to join ${organizationName} on Dokploy`,
		text: html,
	});
};

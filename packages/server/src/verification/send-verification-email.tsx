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

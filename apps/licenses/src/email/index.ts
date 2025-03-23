import { createTransport } from "nodemailer";

export const transporter = createTransport({
	host: process.env.SMTP_SERVER,
	port: Number(process.env.SMTP_PORT),
	auth: {
		user: process.env.SMTP_USERNAME,
		pass: process.env.SMTP_PASSWORD,
	},
});

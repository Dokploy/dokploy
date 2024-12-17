import type {
	discord,
	email,
	slack,
	telegram,
} from "@dokploy/server/db/schema";
import nodemailer from "nodemailer";

export const sendEmailNotification = async (
	connection: typeof email.$inferInsert,
	subject: string,
	htmlContent: string,
) => {
	try {
		const {
			smtpServer,
			smtpPort,
			username,
			password,
			fromAddress,
			toAddresses,
		} = connection;
		const transporter = nodemailer.createTransport({
			host: smtpServer,
			port: smtpPort,
			auth: { user: username, pass: password },
		});

		await transporter.sendMail({
			from: fromAddress,
			to: toAddresses.join(", "),
			subject,
			html: htmlContent,
		});
	} catch (err) {
		console.log(err);
	}
};

export const sendDiscordNotification = async (
	connection: typeof discord.$inferInsert,
	embed: any,
) => {
	try {
		await fetch(connection.webhookUrl, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ embeds: [embed] }),
		});
	} catch (err) {
		console.log(err);
	}
};

export const sendTelegramNotification = async (
	connection: typeof telegram.$inferInsert,
	messageText: string,
) => {
	try {
		const url = `https://api.telegram.org/bot${connection.botToken}/sendMessage`;
		await fetch(url, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				chat_id: connection.chatId,
				text: messageText,
				parse_mode: "HTML",
				disable_web_page_preview: true,
			}),
		});
	} catch (err) {
		console.log(err);
	}
};

export const sendSlackNotification = async (
	connection: typeof slack.$inferInsert,
	message: any,
) => {
	try {
		await fetch(connection.webhookUrl, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(message),
		});
	} catch (err) {
		console.log(err);
	}
};

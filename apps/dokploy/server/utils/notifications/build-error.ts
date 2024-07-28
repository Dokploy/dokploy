import { renderAsync } from "@react-email/components";
import { eq } from "drizzle-orm";
import BuildFailedEmail from "~/emails/emails/build-failed";
import { db } from "~/server/db";
import { notifications } from "~/server/db/schema";
import {
	sendDiscordNotification,
	sendEmailNotification,
	sendSlackNotification,
	sendTelegramNotification,
} from "./utils";

interface Props {
	projectName: string;
	applicationName: string;
	applicationType: string;
	errorMessage: string;
	buildLink: string;
}

export const sendBuildErrorNotifications = async ({
	projectName,
	applicationName,
	applicationType,
	errorMessage,
	buildLink,
}: Props) => {
	const date = new Date();
	const notificationList = await db.query.notifications.findMany({
		where: eq(notifications.appBuildError, true),
		with: {
			email: true,
			discord: true,
			telegram: true,
			slack: true,
		},
	});

	for (const notification of notificationList) {
		const { email, discord, telegram, slack } = notification;
		if (email) {
			const template = await renderAsync(
				BuildFailedEmail({
					projectName,
					applicationName,
					applicationType,
					errorMessage: errorMessage,
					buildLink,
					date: date.toLocaleString(),
				}),
			).catch();
			await sendEmailNotification(email, "Build failed for dokploy", template);
		}

		if (discord) {
			await sendDiscordNotification(discord, {
				title: "⚠️ Build Failed",
				color: 0xff0000,
				fields: [
					{
						name: "Project",
						value: projectName,
						inline: true,
					},
					{
						name: "Application",
						value: applicationName,
						inline: true,
					},
					{
						name: "Type",
						value: applicationType,
						inline: true,
					},
					{
						name: "Error",
						value: errorMessage,
					},
					{
						name: "Build Link",
						value: buildLink,
					},
				],
				timestamp: date.toISOString(),
				footer: {
					text: "Dokploy Build Notification",
				},
			});
		}

		if (telegram) {
			await sendTelegramNotification(
				telegram,
				`
				<b>⚠️ Build Failed</b>
				
				<b>Project:</b> ${projectName}
				<b>Application:</b> ${applicationName}
				<b>Type:</b> ${applicationType}
				<b>Time:</b> ${date.toLocaleString()}
				
				<b>Error:</b>
				<pre>${errorMessage}</pre>
				
				<b>Build Details:</b> ${buildLink}
				`,
			);
		}

		if (slack) {
			const { channel } = slack;
			await sendSlackNotification(slack, {
				channel: channel,
				attachments: [
					{
						color: "#FF0000",
						pretext: ":warning: *Build Failed*",
						fields: [
							{
								title: "Project",
								value: projectName,
								short: true,
							},
							{
								title: "Application",
								value: applicationName,
								short: true,
							},
							{
								title: "Type",
								value: applicationType,
								short: true,
							},
							{
								title: "Time",
								value: date.toLocaleString(),
								short: true,
							},
							{
								title: "Error",
								value: `\`\`\`${errorMessage}\`\`\``,
								short: false,
							},
						],
						actions: [
							{
								type: "button",
								text: "View Build Details",
								url: buildLink,
							},
						],
					},
				],
			});
		}
	}
};

import { db } from "@dokploy/server/db";
import { notifications } from "@dokploy/server/db/schema";
import BuildFailedEmail from "@dokploy/server/emails/emails/build-failed";
import { renderAsync } from "@react-email/components";
import { and, eq } from "drizzle-orm";
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
	adminId: string;
}

export const sendBuildErrorNotifications = async ({
	projectName,
	applicationName,
	applicationType,
	errorMessage,
	buildLink,
	adminId,
}: Props) => {
	const date = new Date();
	const unixDate = ~~((Number(date)) / 1000);
	const notificationList = await db.query.notifications.findMany({
		where: and(
			eq(notifications.appBuildError, true),
			eq(notifications.adminId, adminId),
		),
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
				title: "> `⚠️` - Build Failed",
				color: 0xed4245,
				fields: [
					{
						name: "`🛠️`・Project",
						value: projectName,
						inline: true,
					},
					{
						name: "`⚙️`・Application",
						value: applicationName,
						inline: true,
					},
					{
						name: "`❔`・Type",
						value: applicationType,
						inline: true,
					},
					{
						name: "`📅`・Date",
						value: `<t:${unixDate}:D>`,
						inline: true,
					},
					{
						name: "`⌚`・Time",
						value: `<t:${unixDate}:t>`,
						inline: true,
					},
					{
						name: "`❓`・Type",
						value: "Failed",
						inline: true,
					},
					{
						name: "`⚠️`・Error Message",
						value: `\`\`\`${errorMessage}\`\`\``,
					},
					{
						name: "`🧷`・Build Link",
						value: `[Click here to access build link](${buildLink})`,
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

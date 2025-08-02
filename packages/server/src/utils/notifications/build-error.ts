import { db } from "@dokploy/server/db";
import { notifications } from "@dokploy/server/db/schema";
import BuildFailedEmail from "@dokploy/server/emails/emails/build-failed";
import { renderAsync } from "@react-email/components";
import { format } from "date-fns";
import { and, eq } from "drizzle-orm";
import {
	sendDiscordNotification,
	sendEmailNotification,
	sendGotifyNotification,
	sendSlackNotification,
	sendTelegramNotification,
} from "./utils";

interface Props {
	projectName: string;
	applicationName: string;
	applicationType: string;
	errorMessage: string;
	buildLink: string;
	organizationId: string;
}

export const sendBuildErrorNotifications = async ({
	projectName,
	applicationName,
	applicationType,
	errorMessage,
	buildLink,
	organizationId,
}: Props) => {
	const date = new Date();
	const unixDate = ~~(Number(date) / 1000);
	const notificationList = await db.query.notifications.findMany({
		where: and(
			eq(notifications.appBuildError, true),
			eq(notifications.organizationId, organizationId),
		),
		with: {
			email: true,
			discord: true,
			telegram: true,
			slack: true,
			gotify: true,
		},
	});

	for (const notification of notificationList) {
		const { email, discord, telegram, slack, gotify } = notification;
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
			const decorate = (decoration: string, text: string) =>
				`${discord.decoration ? decoration : ""} ${text}`.trim();

			const limitCharacter = 800;
			const truncatedErrorMessage = errorMessage.substring(0, limitCharacter);
			await sendDiscordNotification(discord, {
				title: decorate(">", "`⚠️` Build Failed"),
				color: 0xed4245,
				fields: [
					{
						name: decorate("`🛠️`", "Project"),
						value: projectName,
						inline: true,
					},
					{
						name: decorate("`⚙️`", "Application"),
						value: applicationName,
						inline: true,
					},
					{
						name: decorate("`❔`", "Type"),
						value: applicationType,
						inline: true,
					},
					{
						name: decorate("`📅`", "Date"),
						value: `<t:${unixDate}:D>`,
						inline: true,
					},
					{
						name: decorate("`⌚`", "Time"),
						value: `<t:${unixDate}:t>`,
						inline: true,
					},
					{
						name: decorate("`❓`", "Type"),
						value: "Failed",
						inline: true,
					},
					{
						name: decorate("`⚠️`", "Error Message"),
						value: `\`\`\`${truncatedErrorMessage}\`\`\``,
					},
					{
						name: decorate("`🧷`", "Build Link"),
						value: `[Click here to access build link](${buildLink})`,
					},
				],
				timestamp: date.toISOString(),
				footer: {
					text: "Dokploy Build Notification",
				},
			});
		}

		if (gotify) {
			const decorate = (decoration: string, text: string) =>
				`${gotify.decoration ? decoration : ""} ${text}\n`;
			await sendGotifyNotification(
				gotify,
				decorate("⚠️", "Build Failed"),
				`${decorate("🛠️", `Project: ${projectName}`)}` +
					`${decorate("⚙️", `Application: ${applicationName}`)}` +
					`${decorate("❔", `Type: ${applicationType}`)}` +
					`${decorate("🕒", `Date: ${date.toLocaleString()}`)}` +
					`${decorate("⚠️", `Error:\n${errorMessage}`)}` +
					`${decorate("🔗", `Build details:\n${buildLink}`)}`,
			);
		}

		if (telegram) {
			const inlineButton = [
				[
					{
						text: "Deployment Logs",
						url: buildLink,
					},
				],
			];

			await sendTelegramNotification(
				telegram,
				`<b>⚠️ Build Failed</b>\n\n<b>Project:</b> ${projectName}\n<b>Application:</b> ${applicationName}\n<b>Type:</b> ${applicationType}\n<b>Date:</b> ${format(date, "PP")}\n<b>Time:</b> ${format(date, "pp")}\n\n<b>Error:</b>\n<pre>${errorMessage}</pre>`,
				inlineButton,
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

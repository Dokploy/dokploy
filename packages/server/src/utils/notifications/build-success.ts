import { db } from "@dokploy/server/db";
import { notifications } from "@dokploy/server/db/schema";
import BuildSuccessEmail from "@dokploy/server/emails/emails/build-success";
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
	buildLink: string;
	adminId: string;
}

export const sendBuildSuccessNotifications = async ({
	projectName,
	applicationName,
	applicationType,
	buildLink,
	adminId,
}: Props) => {
	const date = new Date();
	const unixDate = ~~((Number(date)) / 1000);
	const notificationList = await db.query.notifications.findMany({
		where: and(
			eq(notifications.appDeploy, true),
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
				BuildSuccessEmail({
					projectName,
					applicationName,
					applicationType,
					buildLink,
					date: date.toLocaleString(),
				}),
			).catch();
			await sendEmailNotification(email, "Build success for dokploy", template);
		}

		if (discord) {
			await sendDiscordNotification(discord, {
				title: "> `✅` - Build Success",
				color: 0x57f287,
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
						name: "`❔`・Application Type",
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
						value: "Successful",
						inline: true,
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
				<b>✅ Build Success</b>
				
				<b>Project:</b> ${projectName}
				<b>Application:</b> ${applicationName}
				<b>Type:</b> ${applicationType}
				<b>Time:</b> ${date.toLocaleString()}
				
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
						color: "#00FF00",
						pretext: ":white_check_mark: *Build Success*",
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

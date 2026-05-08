import { db } from "@dokploy/server/db";
import { notifications } from "@dokploy/server/db/schema";
import BuildFailedEmail from "@dokploy/server/emails/emails/build-failed";
import { renderAsync } from "@react-email/components";
import { format } from "date-fns";
import { and, eq } from "drizzle-orm";
import {
	sendCustomNotification,
	sendDiscordNotification,
	sendEmailNotification,
	sendGotifyNotification,
	sendLarkNotification,
	sendMattermostNotification,
	sendNtfyNotification,
	sendPushoverNotification,
	sendResendNotification,
	sendSlackNotification,
	sendTeamsNotification,
	sendTelegramNotification,
} from "./utils";

interface Props {
	projectName: string;
	scheduleName: string;
	scheduleType: string;
	errorMessage: string;
	scheduleLink: string;
	organizationId: string;
}

export const sendScheduleFailureNotifications = async ({
	projectName,
	scheduleName,
	scheduleType,
	errorMessage,
	scheduleLink,
	organizationId,
}: Props) => {
	const date = new Date();
	const unixDate = ~~(Number(date) / 1000);
	const notificationList = await db.query.notifications.findMany({
		where: and(
			eq(notifications.scheduleFailure, true),
			eq(notifications.organizationId, organizationId),
		),
		with: {
			email: true,
			discord: true,
			telegram: true,
			slack: true,
			resend: true,
			gotify: true,
			ntfy: true,
			mattermost: true,
			custom: true,
			lark: true,
			pushover: true,
			teams: true,
		},
	});

	for (const notification of notificationList) {
		const {
			email,
			resend,
			discord,
			telegram,
			slack,
			gotify,
			ntfy,
			mattermost,
			custom,
			lark,
			pushover,
			teams,
		} = notification;
		try {
			if (email || resend) {
				const template = await renderAsync(
					BuildFailedEmail({
						projectName,
						applicationName: scheduleName,
						applicationType: `Schedule (${scheduleType})`,
						errorMessage,
						buildLink: scheduleLink,
						date: date.toLocaleString(),
					}),
				).catch();

				if (email) {
					await sendEmailNotification(
						email,
						"Scheduled job failed for dokploy",
						template,
					);
				}

				if (resend) {
					await sendResendNotification(
						resend,
						"Scheduled job failed for dokploy",
						template,
					);
				}
			}

			if (discord) {
				const decorate = (decoration: string, text: string) =>
					`${discord.decoration ? decoration : ""} ${text}`.trim();

				const limitCharacter = 800;
				const truncatedErrorMessage = errorMessage.substring(0, limitCharacter);
				await sendDiscordNotification(discord, {
					title: decorate(">", "`⏰` Scheduled Job Failed"),
					color: 0xed4245,
					fields: [
						{
							name: decorate("`🛠️`", "Project"),
							value: projectName,
							inline: true,
						},
						{
							name: decorate("`⚙️`", "Schedule"),
							value: scheduleName,
							inline: true,
						},
						{
							name: decorate("`❔`", "Type"),
							value: scheduleType,
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
							name: decorate("`❓`", "Status"),
							value: "Failed",
							inline: true,
						},
						{
							name: decorate("`⚠️`", "Error Message"),
							value: `\`\`\`${truncatedErrorMessage}\`\`\``,
						},
						{
							name: decorate("`🧷`", "Logs"),
							value: `[Click here to view logs](${scheduleLink})`,
						},
					],
					timestamp: date.toISOString(),
					footer: {
						text: "Dokploy Schedule Notification",
					},
				});
			}

			if (gotify) {
				const decorate = (decoration: string, text: string) =>
					`${gotify.decoration ? decoration : ""} ${text}\n`;
				await sendGotifyNotification(
					gotify,
					decorate("⏰", "Scheduled Job Failed"),
					`${decorate("🛠️", `Project: ${projectName}`)}` +
						`${decorate("⚙️", `Schedule: ${scheduleName}`)}` +
						`${decorate("❔", `Type: ${scheduleType}`)}` +
						`${decorate("🕒", `Date: ${date.toLocaleString()}`)}` +
						`${decorate("⚠️", `Error:\n${errorMessage}`)}` +
						`${decorate("🔗", `Logs:\n${scheduleLink}`)}`,
				);
			}

			if (ntfy) {
				await sendNtfyNotification(
					ntfy,
					"Scheduled Job Failed",
					"warning",
					`view, Logs, ${scheduleLink}, clear=true;`,
					`🛠️Project: ${projectName}\n` +
						`⚙️Schedule: ${scheduleName}\n` +
						`❔Type: ${scheduleType}\n` +
						`🕒Date: ${date.toLocaleString()}\n` +
						`⚠️Error:\n${errorMessage}`,
				);
			}

			if (telegram) {
				const inlineButton = [
					[
						{
							text: "View Logs",
							url: scheduleLink,
						},
					],
				];

				await sendTelegramNotification(
					telegram,
					`<b>⏰ Scheduled Job Failed</b>\n\n<b>Project:</b> ${projectName}\n<b>Schedule:</b> ${scheduleName}\n<b>Type:</b> ${scheduleType}\n<b>Date:</b> ${format(date, "PP")}\n<b>Time:</b> ${format(date, "pp")}\n\n<b>Error:</b>\n<pre>${errorMessage}</pre>`,
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
							pretext: ":alarm_clock: *Scheduled Job Failed*",
							fields: [
								{
									title: "Project",
									value: projectName,
									short: true,
								},
								{
									title: "Schedule",
									value: scheduleName,
									short: true,
								},
								{
									title: "Type",
									value: scheduleType,
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
								{
									title: "Details",
									value: `<${scheduleLink}|View Logs>`,
									short: false,
								},
							],
							mrkdwn_in: ["fields"],
						},
					],
				});
			}

			if (mattermost) {
				await sendMattermostNotification(mattermost, {
					text: `:alarm_clock: **Scheduled Job Failed**

**Project:** ${projectName}
**Schedule:** ${scheduleName}
**Type:** ${scheduleType}
**Time:** ${date.toLocaleString()}

**Error:**
\`\`\`
${errorMessage}
\`\`\`

[View Logs](${scheduleLink})`,
					channel: mattermost.channel,
					username: mattermost.username || "Dokploy Bot",
				});
			}

			if (custom) {
				await sendCustomNotification(custom, {
					title: "Schedule Failure",
					message: "Scheduled job failed",
					projectName,
					scheduleName,
					scheduleType,
					errorMessage,
					scheduleLink,
					timestamp: date.toISOString(),
					date: date.toLocaleString(),
					status: "error",
					type: "schedule",
				});
			}

			if (lark) {
				const limitCharacter = 800;
				const truncatedErrorMessage = errorMessage.substring(0, limitCharacter);
				await sendLarkNotification(lark, {
					msg_type: "interactive",
					card: {
						schema: "2.0",
						config: {
							update_multi: true,
							style: {
								text_size: {
									normal_v2: {
										default: "normal",
										pc: "normal",
										mobile: "heading",
									},
								},
							},
						},
						header: {
							title: {
								tag: "plain_text",
								content: "⏰ Scheduled Job Failed",
							},
							subtitle: {
								tag: "plain_text",
								content: "",
							},
							template: "red",
							padding: "12px 12px 12px 12px",
						},
						body: {
							direction: "vertical",
							padding: "12px 12px 12px 12px",
							elements: [
								{
									tag: "column_set",
									columns: [
										{
											tag: "column",
											width: "weighted",
											elements: [
												{
													tag: "markdown",
													content: `**Project:**\n${projectName}`,
													text_align: "left",
													text_size: "normal_v2",
												},
												{
													tag: "markdown",
													content: `**Type:**\n${scheduleType}`,
													text_align: "left",
													text_size: "normal_v2",
												},
												{
													tag: "markdown",
													content: `**Error Message:**\n\`\`\`\n${truncatedErrorMessage}\n\`\`\``,
													text_align: "left",
													text_size: "normal_v2",
												},
											],
											vertical_align: "top",
											weight: 1,
										},
										{
											tag: "column",
											width: "weighted",
											elements: [
												{
													tag: "markdown",
													content: `**Schedule:**\n${scheduleName}`,
													text_align: "left",
													text_size: "normal_v2",
												},
												{
													tag: "markdown",
													content: `**Date:**\n${format(date, "PP pp")}`,
													text_align: "left",
													text_size: "normal_v2",
												},
											],
											vertical_align: "top",
											weight: 1,
										},
									],
								},
								{
									tag: "button",
									text: {
										tag: "plain_text",
										content: "View Logs",
									},
									type: "danger",
									width: "default",
									size: "medium",
									behaviors: [
										{
											type: "open_url",
											default_url: scheduleLink,
											pc_url: "",
											ios_url: "",
											android_url: "",
										},
									],
									margin: "0px 0px 0px 0px",
								},
							],
						},
					},
				});
			}

			if (pushover) {
				await sendPushoverNotification(
					pushover,
					"Scheduled Job Failed",
					`Project: ${projectName}\nSchedule: ${scheduleName}\nType: ${scheduleType}\nDate: ${date.toLocaleString()}\nError: ${errorMessage}`,
				);
			}

			if (teams) {
				const limitCharacter = 800;
				const truncatedErrorMessage = errorMessage.substring(0, limitCharacter);
				await sendTeamsNotification(teams, {
					title: "⏰ Scheduled Job Failed",
					facts: [
						{ name: "Project", value: projectName },
						{ name: "Schedule", value: scheduleName },
						{ name: "Type", value: scheduleType },
						{ name: "Date", value: format(date, "PP pp") },
						{ name: "Error Message", value: truncatedErrorMessage },
					],
					potentialAction: {
						type: "Action.OpenUrl",
						title: "View Logs",
						url: scheduleLink,
					},
				});
			}
		} catch (error) {
			console.log(error);
		}
	}
};

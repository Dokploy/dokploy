import { db } from "@dokploy/server/db";
import { notifications } from "@dokploy/server/db/schema";
import BuildSuccessEmail from "@dokploy/server/emails/emails/build-success";
import type { Domain } from "@dokploy/server/services/domain";
import { renderAsync } from "@react-email/components";
import { format } from "date-fns";
import { and, eq } from "drizzle-orm";
import {
	sendCustomNotification,
	sendDiscordNotification,
	sendEmailNotification,
	sendGotifyNotification,
	sendLarkNotification,
	sendNtfyNotification,
	sendPushoverNotification,
	sendSlackNotification,
	sendTelegramNotification,
} from "./utils";

interface Props {
	projectName: string;
	applicationName: string;
	applicationType: string;
	buildLink: string;
	organizationId: string;
	domains: Domain[];
	environmentName: string;
}

export const sendBuildSuccessNotifications = async ({
	projectName,
	applicationName,
	applicationType,
	buildLink,
	organizationId,
	domains,
	environmentName,
}: Props) => {
	const date = new Date();
	const unixDate = ~~(Number(date) / 1000);
	const notificationList = await db.query.notifications.findMany({
		where: and(
			eq(notifications.appDeploy, true),
			eq(notifications.organizationId, organizationId),
		),
		with: {
			email: true,
			discord: true,
			telegram: true,
			slack: true,
			gotify: true,
			ntfy: true,
			custom: true,
			lark: true,
			pushover: true,
		},
	});

	for (const notification of notificationList) {
		const {
			email,
			discord,
			telegram,
			slack,
			gotify,
			ntfy,
			custom,
			lark,
			pushover,
		} = notification;
		try {
			if (email) {
				const template = await renderAsync(
					BuildSuccessEmail({
						projectName,
						applicationName,
						applicationType,
						buildLink,
						date: date.toLocaleString(),
						environmentName,
					}),
				).catch();
				await sendEmailNotification(
					email,
					"Build success for dokploy",
					template,
				);
			}

			if (discord) {
				const decorate = (decoration: string, text: string) =>
					`${discord.decoration ? decoration : ""} ${text}`.trim();

				await sendDiscordNotification(discord, {
					title: decorate(">", "`✅` Build Successes"),
					color: 0x57f287,
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
							name: decorate("`🌍`", "Environment"),
							value: environmentName,
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
							value: "Successful",
							inline: true,
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
					decorate("✅", "Build Success"),
					`${decorate("🛠️", `Project: ${projectName}`)}` +
						`${decorate("⚙️", `Application: ${applicationName}`)}` +
						`${decorate("🌍", `Environment: ${environmentName}`)}` +
						`${decorate("❔", `Type: ${applicationType}`)}` +
						`${decorate("🕒", `Date: ${date.toLocaleString()}`)}` +
						`${decorate("🔗", `Build details:\n${buildLink}`)}`,
				);
			}

			if (ntfy) {
				await sendNtfyNotification(
					ntfy,
					"Build Success",
					"white_check_mark",
					`view, Build details, ${buildLink}, clear=true;`,
					`🛠Project: ${projectName}\n` +
						`⚙️Application: ${applicationName}\n` +
						`🌍Environment: ${environmentName}\n` +
						`❔Type: ${applicationType}\n` +
						`🕒Date: ${date.toLocaleString()}`,
				);
			}

			if (telegram) {
				const chunkArray = <T>(array: T[], chunkSize: number): T[][] =>
					Array.from({ length: Math.ceil(array.length / chunkSize) }, (_, i) =>
						array.slice(i * chunkSize, i * chunkSize + chunkSize),
					);

				const inlineButton = [
					[
						{
							text: "Deployment Logs",
							url: buildLink,
						},
					],
					...chunkArray(domains, 2).map((chunk) =>
						chunk.map((data) => ({
							text: data.host,
							url: `${data.https ? "https" : "http"}://${data.host}`,
						})),
					),
				];

				await sendTelegramNotification(
					telegram,
					`<b>✅ Build Success</b>\n\n<b>Project:</b> ${projectName}\n<b>Application:</b> ${applicationName}\n<b>Environment:</b> ${environmentName}\n<b>Type:</b> ${applicationType}\n<b>Date:</b> ${format(
						date,
						"PP",
					)}\n<b>Time:</b> ${format(date, "pp")}`,
					inlineButton,
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
									title: "Environment",
									value: environmentName,
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

			if (custom) {
				await sendCustomNotification(custom, {
					title: "Build Success",
					message: "Build completed successfully",
					projectName,
					applicationName,
					applicationType,
					buildLink,
					timestamp: date.toISOString(),
					date: date.toLocaleString(),
					domains: domains.map((domain) => domain.host).join(", "),
					status: "success",
					type: "build",
				});
			}

			if (lark) {
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
								content: "✅ Build Success",
							},
							subtitle: {
								tag: "plain_text",
								content: "",
							},
							template: "green",
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
													content: `**Environment:**\n${environmentName}`,
													text_align: "left",
													text_size: "normal_v2",
												},
												{
													tag: "markdown",
													content: `**Type:**\n${applicationType}`,
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
													content: `**Application:**\n${applicationName}`,
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
										content: "View Build Details",
									},
									type: "primary",
									width: "default",
									size: "medium",
									behaviors: [
										{
											type: "open_url",
											default_url: buildLink,
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
					"Build Success",
					`Project: ${projectName}\nApplication: ${applicationName}\nEnvironment: ${environmentName}\nType: ${applicationType}\nDate: ${date.toLocaleString()}`,
				);
			}
		} catch (error) {
			console.log(error);
		}
	}
};

import { db } from "@dokploy/server/db";
import { notifications } from "@dokploy/server/db/schema";
import UpdateAvailableEmail from "@dokploy/server/emails/emails/dokploy-update";
import { getDokployUrl } from "@dokploy/server/services/admin";
import { renderAsync } from "@react-email/components";
import { and, eq } from "drizzle-orm";
import {
	sendDiscordNotification,
	sendEmailNotification,
	sendGotifyNotification,
	sendLarkNotification,
	sendNtfyNotification,
	sendSlackNotification,
	sendTelegramNotification,
} from "./utils";

interface Props {
	currentVersion: string;
	latestVersion: string;
	organizationId: string;
}

export const sendUpdateNotifications = async ({
	currentVersion,
	latestVersion,
	organizationId,
}: Props) => {
	const date = new Date();
	const unixDate = ~~(Number(date) / 1000);
	const dokployUrl = await getDokployUrl();
	const updateInstructions =
		"curl -sSL https://dokploy.com/install.sh | sh -s update";

	const notificationList = await db.query.notifications.findMany({
		where: and(
			eq(notifications.dokployUpdate, true),
			eq(notifications.organizationId, organizationId),
		),
		with: {
			email: true,
			discord: true,
			telegram: true,
			slack: true,
			gotify: true,
			ntfy: true,
			lark: true,
		},
	});

	for (const notification of notificationList) {
		const { email, discord, telegram, slack, gotify, ntfy, lark } =
			notification;

		if (email) {
			const template = await renderAsync(
				UpdateAvailableEmail({
					currentVersion,
					latestVersion,
					updateInstructions,
					dashboardLink: dokployUrl,
					date: date.toLocaleString(),
				}),
			).catch(() => "");
			await sendEmailNotification(email, "Dokploy Update Available", template);
		}

		if (discord) {
			const decorate = (decoration: string, text: string) =>
				`${discord.decoration ? decoration : ""} ${text}`.trim();

			await sendDiscordNotification(discord, {
				title: decorate(">", "`🔔` Dokploy Update Available"),
				color: 0x5865f2,
				fields: [
					{
						name: decorate("`📦`", "Current Version"),
						value: currentVersion,
						inline: true,
					},
					{
						name: decorate("`✨`", "Latest Version"),
						value: latestVersion,
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
						name: decorate("`🔧`", "Update Command"),
						value: `\`\`\`bash\n${updateInstructions}\n\`\`\``,
					},
					{
						name: decorate("`🔗`", "Dashboard"),
						value: `[Open Dashboard](${dokployUrl})`,
					},
				],
				timestamp: date.toISOString(),
				footer: {
					text: "Dokploy Update Notification",
				},
			});
		}

		if (gotify) {
			const decorate = (decoration: string, text: string) =>
				`${gotify.decoration ? decoration : ""} ${text}\n`;
			await sendGotifyNotification(
				gotify,
				decorate("🔔", "Dokploy Update Available"),
				`${decorate("📦", `Current: ${currentVersion}`)}` +
					`${decorate("✨", `Latest: ${latestVersion}`)}` +
					`${decorate("🕒", `Date: ${date.toLocaleString()}`)}` +
					`${decorate("🔧", `Update:\n${updateInstructions}`)}` +
					`${decorate("🔗", `Dashboard:\n${dokployUrl}`)}`,
			);
		}

		if (ntfy) {
			await sendNtfyNotification(
				ntfy,
				"Dokploy Update Available",
				"default",
				`view, Open Dashboard, ${dokployUrl}, clear=true;`,
				`📦 Current: ${currentVersion}\n` +
					`✨ Latest: ${latestVersion}\n` +
					`🕒 Date: ${date.toLocaleString()}\n` +
					`🔧 Update:\n${updateInstructions}`,
			);
		}

		if (telegram) {
			const inlineButton = [
				[
					{
						text: "Open Dashboard",
						url: dokployUrl,
					},
				],
			];

			await sendTelegramNotification(
				telegram,
				"<b>🔔 Dokploy Update Available</b>\n\n" +
					`<b>Current Version:</b> ${currentVersion}\n` +
					`<b>Latest Version:</b> ${latestVersion}\n` +
					`<b>Date:</b> ${date.toLocaleString()}\n\n` +
					`<b>Update Command:</b>\n<code>${updateInstructions}</code>`,
				inlineButton,
			);
		}

		if (slack) {
			const { channel } = slack;
			await sendSlackNotification(slack, {
				channel: channel,
				attachments: [
					{
						color: "#5865F2",
						pretext: ":bell: *Dokploy Update Available*",
						fields: [
							{
								title: "Current Version",
								value: currentVersion,
								short: true,
							},
							{
								title: "Latest Version",
								value: latestVersion,
								short: true,
							},
							{
								title: "Date",
								value: date.toLocaleString(),
								short: true,
							},
							{
								title: "Update Command",
								value: `\`\`\`${updateInstructions}\`\`\``,
								short: false,
							},
						],
						actions: [
							{
								type: "button",
								text: "Open Dashboard",
								url: dokployUrl,
							},
						],
					},
				],
			});
		}

		if (lark) {
			await sendLarkNotification(lark, {
				msg_type: "interactive",
				card: {
					schema: "2.0",
					config: {
						update_multi: true,
					},
					header: {
						title: {
							tag: "plain_text",
							content: "🔔 Dokploy Update Available",
						},
						template: "blue",
					},
					body: {
						direction: "vertical",
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
												content: `**Current Version:**\n${currentVersion}`,
												text_align: "left",
											},
											{
												tag: "markdown",
												content: `**Date:**\n${date.toLocaleString()}`,
												text_align: "left",
											},
										],
										weight: 1,
									},
									{
										tag: "column",
										width: "weighted",
										elements: [
											{
												tag: "markdown",
												content: `**Latest Version:**\n${latestVersion}`,
												text_align: "left",
											},
										],
										weight: 1,
									},
								],
							},
							{
								tag: "markdown",
								content: `**Update Command:**\n\`\`\`\n${updateInstructions}\n\`\`\``,
							},
							{
								tag: "button",
								text: {
									tag: "plain_text",
									content: "Open Dashboard",
								},
								type: "primary",
								behaviors: [
									{
										type: "open_url",
										default_url: dokployUrl,
									},
								],
							},
						],
					},
				},
			});
		}
	}
};

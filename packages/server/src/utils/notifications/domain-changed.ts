import { db } from "@dokploy/server/db";
import { notifications } from "@dokploy/server/db/schema";
import DomainChangedEmail from "@dokploy/server/emails/emails/domain-changed";
import type { Domain } from "@dokploy/server/services/domain";
import { render } from "@react-email/components";
import { format } from "date-fns";
import { and, eq } from "drizzle-orm";
import {
	escapeHtml,
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
	event: "created" | "updated" | "removed";
	domain: Domain;
	projectName: string;
	serviceName: string;
	serviceType: "application" | "compose";
	environmentName: string;
	organizationId: string;
}

export const sendDomainChangedNotifications = async ({
	event,
	domain,
	projectName,
	serviceName,
	serviceType,
	environmentName,
	organizationId,
}: Props) => {
	const date = new Date();
	const unixDate = ~~(Number(date) / 1000);
	const notificationList = await db.query.notifications.findMany({
		where: and(
			eq(notifications.domainChanged, true),
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

	const title = `Domain ${{ created: "Added", updated: "Updated", removed: "Removed" }[event]}`;
	const url = `${domain.https ? "https" : "http"}://${domain.host}${domain.path && domain.path !== "/" ? domain.path : ""}`;
	const type = serviceType === "application" ? "Application" : "Compose";
	const status = domain.enabled ? "Enabled" : "Disabled";

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
				const template = await render(
					DomainChangedEmail({
						title,
						url,
						projectName,
						serviceName,
						serviceType: type,
						environmentName,
						status,
						date: date.toLocaleString(),
					}),
				).catch();

				if (email) {
					await sendEmailNotification(email, `${title} on Dokploy`, template);
				}

				if (resend) {
					await sendResendNotification(resend, `${title} on Dokploy`, template);
				}
			}

			if (discord) {
				const decorate = (decoration: string, text: string) =>
					`${discord.decoration ? decoration : ""} ${text}`.trim();

				await sendDiscordNotification(discord, {
					title: decorate(">", `\`🌐\` ${title}`),
					color: 0x5865f2,
					fields: [
						{
							name: decorate("`🔗`", "Domain"),
							value: url,
						},
						{
							name: decorate("`🛠️`", "Project"),
							value: projectName,
							inline: true,
						},
						{
							name: decorate("`⚙️`", type),
							value: serviceName,
							inline: true,
						},
						{
							name: decorate("`🌍`", "Environment"),
							value: environmentName,
							inline: true,
						},
						{
							name: decorate("`🚦`", "Status"),
							value: status,
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
					],
					timestamp: date.toISOString(),
					footer: {
						text: "Dokploy Domain Notification",
					},
				});
			}

			if (gotify) {
				const decorate = (decoration: string, text: string) =>
					`${gotify.decoration ? decoration : ""} ${text}\n`;
				await sendGotifyNotification(
					gotify,
					decorate("🌐", title),
					`${decorate("🔗", `Domain: ${url}`)}` +
						`${decorate("🛠️", `Project: ${projectName}`)}` +
						`${decorate("⚙️", `${type}: ${serviceName}`)}` +
						`${decorate("🌍", `Environment: ${environmentName}`)}` +
						`${decorate("🚦", `Status: ${status}`)}` +
						`${decorate("🕒", `Date: ${date.toLocaleString()}`)}`,
				);
			}

			if (ntfy) {
				await sendNtfyNotification(
					ntfy,
					title,
					"globe_with_meridians",
					`view, Open domain, ${url}, clear=true;`,
					`🔗Domain: ${url}\n` +
						`🛠Project: ${projectName}\n` +
						`⚙️${type}: ${serviceName}\n` +
						`🌍Environment: ${environmentName}\n` +
						`🚦Status: ${status}\n` +
						`🕒Date: ${date.toLocaleString()}`,
				);
			}

			if (telegram) {
				await sendTelegramNotification(
					telegram,
					`<b>🌐 ${title}</b>\n\n<b>Domain:</b> ${escapeHtml(url)}\n<b>Project:</b> ${escapeHtml(projectName)}\n<b>${type}:</b> ${escapeHtml(serviceName)}\n<b>Environment:</b> ${escapeHtml(environmentName)}\n<b>Status:</b> ${status}\n<b>Date:</b> ${format(
						date,
						"PP",
					)}\n<b>Time:</b> ${format(date, "pp")}`,
				);
			}

			if (slack) {
				const { channel } = slack;
				await sendSlackNotification(slack, {
					channel: channel,
					attachments: [
						{
							color: "#5865F2",
							pretext: `:globe_with_meridians: *${title}*`,
							fields: [
								{
									title: "Domain",
									value: url,
									short: false,
								},
								{
									title: "Project",
									value: projectName,
									short: true,
								},
								{
									title: type,
									value: serviceName,
									short: true,
								},
								{
									title: "Environment",
									value: environmentName,
									short: true,
								},
								{
									title: "Status",
									value: status,
									short: true,
								},
								{
									title: "Time",
									value: date.toLocaleString(),
									short: true,
								},
							],
							mrkdwn_in: ["fields"],
						},
					],
				});
			}

			if (mattermost) {
				await sendMattermostNotification(mattermost, {
					text: `**🌐 ${title}**\n\n**Domain:** ${url}\n**Project:** ${projectName}\n**${type}:** ${serviceName}\n**Environment:** ${environmentName}\n**Status:** ${status}\n**Date:** ${format(date, "PP")}\n**Time:** ${format(date, "pp")}`,
					channel: mattermost.channel,
					username: mattermost.username || "Dokploy",
				});
			}

			if (custom) {
				await sendCustomNotification(custom, {
					title,
					message: `Domain ${domain.host} was ${event}`,
					event,
					domainId: domain.domainId,
					host: domain.host,
					url,
					https: domain.https,
					path: domain.path,
					port: domain.port,
					enabled: domain.enabled,
					projectName,
					serviceName,
					serviceType,
					environmentName,
					timestamp: date.toISOString(),
					date: date.toLocaleString(),
					type: "domain",
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
								content: `🌐 ${title}`,
							},
							subtitle: {
								tag: "plain_text",
								content: url,
							},
							template: "blue",
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
													content: `**Status:**\n${status}`,
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
													content: `**${type}:**\n${serviceName}`,
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
							],
						},
					},
				});
			}

			if (pushover) {
				await sendPushoverNotification(
					pushover,
					title,
					`Domain: ${url}\nProject: ${projectName}\n${type}: ${serviceName}\nEnvironment: ${environmentName}\nStatus: ${status}\nDate: ${date.toLocaleString()}`,
				);
			}

			if (teams) {
				await sendTeamsNotification(teams, {
					title: `🌐 ${title}`,
					facts: [
						{ name: "Domain", value: url },
						{ name: "Project", value: projectName },
						{ name: type, value: serviceName },
						{ name: "Environment", value: environmentName },
						{ name: "Status", value: status },
						{ name: "Date", value: format(date, "PP pp") },
					],
				});
			}
		} catch (error) {
			console.log(error);
		}
	}
};

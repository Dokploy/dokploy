import { db } from "@dokploy/server/db";
import { notifications } from "@dokploy/server/db/schema";
import BuildSuccessEmail from "@dokploy/server/emails/emails/build-success";
import type { Domain } from "@dokploy/server/services/domain";
import { renderAsync } from "@react-email/components";
import { format } from "date-fns";
import { and, eq } from "drizzle-orm";
import { getNotificationsForService } from "./scoped-notifications";
import {
	sendDiscordNotification,
	sendEmailNotification,
	sendGotifyNotification,
	sendNtfyNotification,
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
	serviceId?: string;
	serviceType?:
		| "application"
		| "postgres"
		| "mysql"
		| "mariadb"
		| "mongo"
		| "redis"
		| "compose";
}

export const sendBuildSuccessNotifications = async ({
	projectName,
	applicationName,
	applicationType,
	buildLink,
	organizationId,
	domains,
	serviceId,
	serviceType,
}: Props) => {
	const date = new Date();
	const unixDate = ~~(Number(date) / 1000);

	console.log("=== BUILD SUCCESS NOTIFICATION DISPATCH ===");
	console.log(`Service ID: ${serviceId}`);
	console.log(`Service Type: ${serviceType}`);
	console.log(`Project Name: ${projectName}`);
	console.log(`Application Name: ${applicationName}`);
	console.log(`Organization ID: ${organizationId}`);

	// Get scoped notifications - check in order: service-specific, organization-wide
	let notificationList = [];

	if (serviceId && serviceType) {
		console.log("Checking for service-specific notifications first");
		// First check for service-specific notifications
		const serviceNotifications = await getNotificationsForService(
			serviceId,
			serviceType,
			"appDeploy",
			organizationId,
		);

		// The serviceNotifications already contain only notifications for this specific service
		const matchingServiceNotifications = serviceNotifications;

		if (matchingServiceNotifications.length > 0) {
			console.log(
				`Found ${matchingServiceNotifications.length} service-specific notifications for this service, using those`,
			);
			notificationList = matchingServiceNotifications;
		} else {
			console.log(
				"No service-specific notifications found for this service, using organization-wide fallback",
			);
			// Fallback to organization-wide notifications
			notificationList = await db.query.notifications.findMany({
				where: and(
					eq(notifications.appDeploy, true),
					eq(notifications.organizationId, organizationId),
					eq(notifications.scope, "organization"),
				),
				with: {
					email: true,
					discord: true,
					telegram: true,
					slack: true,
					gotify: true,
					ntfy: true,
				},
			});
		}
	} else {
		console.log("No service info provided, using organization-wide fallback");
		// Fallback to organization-wide notifications
		notificationList = await db.query.notifications.findMany({
			where: and(
				eq(notifications.appDeploy, true),
				eq(notifications.organizationId, organizationId),
				eq(notifications.scope, "organization"),
			),
			with: {
				email: true,
				discord: true,
				telegram: true,
				slack: true,
				gotify: true,
				ntfy: true,
			},
		});
	}

	console.log(`Final notification list length: ${notificationList.length}`);

	for (const notification of notificationList) {
		const { email, discord, telegram, slack, gotify, ntfy } = notification;

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
			const decorate = (decoration: string, text: string) =>
				`${discord.decoration ? decoration : ""} ${text}`.trim();

			await sendDiscordNotification(discord, {
				title: decorate(">", "`✅` Build Success"),
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
				`<b>✅ Build Success</b>\n\n<b>Project:</b> ${projectName}\n<b>Application:</b> ${applicationName}\n<b>Type:</b> ${applicationType}\n<b>Date:</b> ${format(date, "PP")}\n<b>Time:</b> ${format(date, "pp")}`,
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

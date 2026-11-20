import { randomUUID } from "node:crypto";
import { IS_CLOUD } from "@dokploy/server/constants";
import { db } from "@dokploy/server/db";
import {
	notifications,
	server,
	traefikUpdateDeliveries,
} from "@dokploy/server/db/schema";
import { getDokployUrl } from "@dokploy/server/services/admin";
import { getTraefikOverview } from "@dokploy/server/services/settings";
import { and, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { scheduleJob } from "node-schedule";
import semver from "semver";
import { getTraefikReleaseNotesUrl } from "../traefik/release-notes";
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

const SERVER_CONCURRENCY = 5;

const getDestinations = () =>
	db.query.notifications.findMany({
		where: eq(notifications.traefikUpdateAvailable, true),
		with: {
			custom: true,
			discord: true,
			email: true,
			gotify: true,
			lark: true,
			mattermost: true,
			ntfy: true,
			pushover: true,
			resend: true,
			slack: true,
			teams: true,
			telegram: true,
		},
	});

type Destination = Awaited<ReturnType<typeof getDestinations>>[number];
type Update = {
	serverId?: string;
	serverName: string;
	currentVersion: string;
	recommendedVersion: string;
	settingsUrl: string;
	releaseNotesUrl: string | null;
};

const sendUpdate = async (destination: Destination, update: Update) => {
	const { notificationType } = destination;
	const title = "Traefik update available";
	const serverName = update.serverName.replace(/\s+/g, " ").slice(0, 150);
	const facts: { name: string; value: string; link?: boolean }[] = [
		{
			name: "Server",
			value: update.serverId
				? `${serverName} (${update.serverId})`
				: serverName,
		},
		{ name: "Installed version", value: `v${update.currentVersion}` },
		{ name: "Recommended version", value: `v${update.recommendedVersion}` },
		{ name: "Settings", value: update.settingsUrl, link: true },
	];
	if (update.releaseNotesUrl) {
		facts.push({
			name: "Release notes",
			value: update.releaseNotesUrl,
			link: true,
		});
	}
	const message = facts
		.map(({ name, value }) => `${name}: ${value}`)
		.join("\n");
	const html = facts
		.map(({ name, value, link }) => {
			const text = escapeHtml(value);
			return `<b>${name}:</b> ${link ? `<a href="${text.replace(/"/g, "&quot;")}">${text}</a>` : text}`;
		})
		.join("<br>");
	const markdown = `${title}\n\n${message}`;

	switch (notificationType) {
		case "custom":
			if (destination.custom) {
				return sendCustomNotification(destination.custom, {
					...update,
					serverId: update.serverId ?? null,
					title,
					message,
					type: "traefik-update-available",
					timestamp: new Date().toISOString(),
				});
			}
			break;
		case "discord":
			if (destination.discord) {
				return sendDiscordNotification(destination.discord, {
					title,
					description: message,
					url: update.settingsUrl,
				});
			}
			break;
		case "email":
			if (destination.email) {
				return sendEmailNotification(destination.email, title, html);
			}
			break;
		case "gotify":
			if (destination.gotify) {
				return sendGotifyNotification(destination.gotify, title, message);
			}
			break;
		case "lark":
			if (destination.lark) {
				return sendLarkNotification(destination.lark, {
					msg_type: "text",
					content: { text: markdown },
				});
			}
			break;
		case "mattermost":
			if (destination.mattermost) {
				return sendMattermostNotification(destination.mattermost, {
					text: markdown,
					channel: destination.mattermost.channel,
					username: destination.mattermost.username || "Dokploy",
				});
			}
			break;
		case "ntfy":
			if (destination.ntfy) {
				return sendNtfyNotification(destination.ntfy, title, "", "", message);
			}
			break;
		case "pushover":
			if (destination.pushover) {
				return sendPushoverNotification(destination.pushover, title, message);
			}
			break;
		case "resend":
			if (destination.resend) {
				return sendResendNotification(destination.resend, title, html);
			}
			break;
		case "slack":
			if (destination.slack) {
				return sendSlackNotification(destination.slack, {
					channel: destination.slack.channel,
					text: escapeHtml(markdown),
					mrkdwn: false,
				});
			}
			break;
		case "teams":
			if (destination.teams) {
				return sendTeamsNotification(destination.teams, {
					title,
					facts,
					potentialAction: {
						type: "Action.OpenUrl",
						title: "Open settings",
						url: update.settingsUrl,
					},
				});
			}
			break;
		case "telegram":
			if (destination.telegram) {
				return sendTelegramNotification(
					destination.telegram,
					`<b>${title}</b>\n\n${html.replaceAll("<br>", "\n")}`,
				);
			}
			break;
	}
	throw new Error(
		"Notification destination is missing its provider configuration",
	);
};

const deliverUpdate = async (destination: Destination, update: Update) => {
	const table = traefikUpdateDeliveries;
	const key = {
		notificationId: destination.notificationId,
		serverKey: update.serverId ? `remote:${update.serverId}` : "local",
		recommendedVersion: update.recommendedVersion,
	};
	const claimToken = randomUUID();
	const claimedUntil = sql`now() + interval '15 minutes'`;
	const [claim] = await db
		.insert(table)
		.values({ ...key, claimToken, claimedUntil })
		.onConflictDoUpdate({
			target: [table.notificationId, table.serverKey, table.recommendedVersion],
			set: { claimToken, claimedUntil },
			setWhere: and(
				isNull(table.deliveredAt),
				sql`${table.claimedUntil} <= now()`,
			),
		})
		.returning({ claimToken: table.claimToken });
	if (!claim) return;

	const ownedClaim = and(
		eq(table.notificationId, key.notificationId),
		eq(table.serverKey, key.serverKey),
		eq(table.recommendedVersion, key.recommendedVersion),
		eq(table.claimToken, claimToken),
	);

	try {
		await sendUpdate(destination, update);
	} catch (error) {
		await db.delete(table).where(ownedClaim);
		throw error;
	}
	await db.update(table).set({ deliveredAt: sql`now()` }).where(ownedClaim);
};

export const checkTraefikUpdates = async () => {
	const destinations = await getDestinations();
	if (destinations.length === 0) return;

	const byOrganization = new Map<string, Destination[]>();
	for (const destination of destinations) {
		const group = byOrganization.get(destination.organizationId) ?? [];
		group.push(destination);
		byOrganization.set(destination.organizationId, group);
	}
	const remoteServers = await db.query.server.findMany({
		columns: { serverId: true, name: true, organizationId: true },
		where: and(
			inArray(server.organizationId, [...byOrganization.keys()]),
			eq(server.serverType, "deploy"),
			eq(server.serverStatus, "active"),
			isNotNull(server.sshKeyId),
		),
	});
	const targets: {
		serverId?: string;
		name: string;
		destinations: Destination[];
	}[] = remoteServers.map(({ serverId, name, organizationId }) => ({
		serverId,
		name,
		destinations: byOrganization.get(organizationId) ?? [],
	}));
	if (!IS_CLOUD) {
		targets.unshift({
			serverId: undefined,
			name: "Dokploy server",
			destinations,
		});
	}
	if (targets.length === 0) return;

	const baseUrl = await getDokployUrl();
	const pending = targets.values();
	const checkNextServers = async () => {
		for (const target of pending) {
			const { serverId, name } = target;
			try {
				const overview = await getTraefikOverview(serverId);
				if (
					overview.versionStatus !== "outdated" ||
					overview.state !== "running" ||
					!overview.currentVersion
				) {
					continue;
				}
				const recommendedVersion =
					semver.valid(overview.recommendedVersion) ??
					overview.recommendedVersion;
				const settingsPath = serverId
					? `/dashboard/settings/servers#server-${encodeURIComponent(serverId)}`
					: "/dashboard/settings/server#traefik";
				const update = {
					serverId,
					serverName: name,
					currentVersion: overview.currentVersion,
					recommendedVersion,
					settingsUrl: `${baseUrl.replace(/\/+$/, "")}${settingsPath}`,
					releaseNotesUrl: getTraefikReleaseNotesUrl(
						overview.recommendedVersion,
					),
				};
				for (const destination of target.destinations) {
					try {
						await deliverUpdate(destination, update);
					} catch {
						console.warn("[Traefik] Update notification failed", {
							serverId,
							notificationId: destination.notificationId,
						});
					}
				}
			} catch {
				console.warn("[Traefik] Version check failed", { serverId });
			}
		}
	};
	await Promise.all(
		Array.from(
			{ length: Math.min(SERVER_CONCURRENCY, targets.length) },
			checkNextServers,
		),
	);
};

export const initTraefikUpdateChecks = () => {
	scheduleJob("traefik-update-check", "0 4 * * *", async () => {
		try {
			await checkTraefikUpdates();
		} catch {
			console.error("[Traefik] Scheduled update check failed");
		}
	});
};

"use client";

import Head from "next/head";
import { useTranslations } from "next-intl";

export type DashboardPageTitleKey =
	| "profile"
	| "users"
	| "servers"
	| "server"
	| "registry"
	| "gitProviders"
	| "sshKeys"
	| "certificates"
	| "notifications"
	| "auditLogs"
	| "destinations"
	| "billing"
	| "invoices"
	| "license"
	| "nodes"
	| "sso"
	| "whitelabeling"
	| "ai"
	| "tags"
	| "projects"
	| "traefik"
	| "swarm"
	| "requests"
	| "schedules"
	| "deployments"
	| "monitoring"
	| "docker";

interface Props {
	pageTitleKey: DashboardPageTitleKey;
}

export const DashboardDocumentTitle = ({ pageTitleKey }: Props) => {
	const tRoot = useTranslations();
	const tLayout = useTranslations("layout");
	const segment = tRoot(`pageTitles.${pageTitleKey}`);
	const appName = tLayout("defaultAppName");

	return (
		<Head>
			<title>
				{segment} | {appName}
			</title>
		</Head>
	);
};

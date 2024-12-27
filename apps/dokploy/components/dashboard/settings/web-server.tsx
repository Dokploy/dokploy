import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { api } from "@/utils/api";
import { useTranslation } from "next-i18next";
import React from "react";
import { ShowDokployActions } from "./servers/actions/show-dokploy-actions";
import { ShowStorageActions } from "./servers/actions/show-storage-actions";
import { ShowTraefikActions } from "./servers/actions/show-traefik-actions";
import { ToggleDockerCleanup } from "./servers/actions/toggle-docker-cleanup";
import { UpdateServer } from "./web-server/update-server";

interface Props {
	className?: string;
}
export const WebServer = ({ className }: Props) => {
	const { t } = useTranslation("settings");
	const { data } = api.admin.one.useQuery();

	const { data: dokployVersion } = api.settings.getDokployVersion.useQuery();

	return (
		<Card className={cn("w-full rounded-lg bg-transparent p-0", className)}>
			<CardHeader>
				<CardTitle className="text-xl">
					{t("settings.server.webServer.title")}
				</CardTitle>
				<CardDescription>
					{t("settings.server.webServer.description")}
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-4 ">
				<div className="grid gap-4 md:grid-cols-2">
					<ShowDokployActions />
					<ShowTraefikActions />
					<ShowStorageActions />

					<UpdateServer />
				</div>

				<div className="flex flex-wrap items-center justify-between gap-4">
					<span className="text-muted-foreground text-sm">
						Server IP: {data?.serverIp}
					</span>
					<span className="text-muted-foreground text-sm">
						Version: {dokployVersion}
					</span>

					<ToggleDockerCleanup />
				</div>
			</CardContent>
		</Card>
	);
};

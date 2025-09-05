import { ServerIcon } from "lucide-react";
import { useTranslation } from "next-i18next";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { api } from "@/utils/api";
import { ShowDokployActions } from "./servers/actions/show-dokploy-actions";
import { ShowStorageActions } from "./servers/actions/show-storage-actions";
import { ShowTraefikActions } from "./servers/actions/show-traefik-actions";
import { ToggleDockerCleanup } from "./servers/actions/toggle-docker-cleanup";
import { UpdateServer } from "./web-server/update-server";

export const WebServer = () => {
	const { t } = useTranslation("settings");
	const { data } = api.user.get.useQuery();

	const { data: dokployVersion } = api.settings.getDokployVersion.useQuery();

	return (
		<div className="w-full">
			{/* <Card className={cn("rounded-lg w-full bg-transparent p-0", className)}></Card> */}
			<Card className="h-full bg-sidebar  p-2.5 rounded-xl  max-w-5xl mx-auto">
				<div className="rounded-xl bg-background shadow-md ">
					<CardHeader className="">
						<CardTitle className="text-xl flex flex-row gap-2">
							<ServerIcon className="size-6 text-muted-foreground self-center" />
							{t("settings.server.webServer.title")}
						</CardTitle>
						<CardDescription>
							{t("settings.server.webServer.description")}
						</CardDescription>
					</CardHeader>
					{/* <CardHeader>
						<CardTitle className="text-xl">
							{t("settings.server.webServer.title")}
						</CardTitle>
						<CardDescription>
							{t("settings.server.webServer.description")}
						</CardDescription>
					</CardHeader> */}
					<CardContent className="space-y-6 py-6 border-t">
						<div className="grid md:grid-cols-2 gap-4">
							<ShowDokployActions />
							<ShowTraefikActions />
							<ShowStorageActions />

							<UpdateServer />
						</div>

						<div className="flex items-center flex-wrap justify-between gap-4">
							<span className="text-sm text-muted-foreground">
								Server IP: {data?.user.serverIp}
							</span>
							<span className="text-sm text-muted-foreground">
								Version: {dokployVersion}
							</span>

							<ToggleDockerCleanup />
						</div>
					</CardContent>
				</div>
			</Card>
		</div>
	);
};

import { ServerIcon } from "lucide-react";
import { useTranslations } from "next-intl";
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
	const t = useTranslations("settingsWebServer");
	const { data: webServerSettings } =
		api.settings.getWebServerSettings.useQuery();

	const { data: dokployVersion } = api.settings.getDokployVersion.useQuery();

	return (
		<div className="w-full">
			{/* <Card className={cn("rounded-lg w-full bg-transparent p-0", className)}></Card> */}
			<Card className="h-full bg-sidebar  p-2.5 rounded-xl  max-w-5xl mx-auto">
				<div className="rounded-xl bg-background shadow-md ">
					<CardHeader className="">
						<CardTitle className="text-xl flex flex-row gap-2">
							<ServerIcon className="size-6 text-muted-foreground self-center" />
							{t("title")}
						</CardTitle>
						<CardDescription>{t("description")}</CardDescription>
					</CardHeader>
					{/* <CardHeader>
						<CardTitle className="text-xl">
							Web Server
						</CardTitle>
						<CardDescription>
							Reload or clean the web server.
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
								{t("serverIpLabel")} {webServerSettings?.serverIp}
							</span>
							<span className="text-sm text-muted-foreground">
								{t("versionLabel")} {dokployVersion}
							</span>

							<ToggleDockerCleanup />
						</div>
					</CardContent>
				</div>
			</Card>
		</div>
	);
};

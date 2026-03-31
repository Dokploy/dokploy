import { ServerIcon } from "lucide-react";
import { api } from "@/utils/api";
import { ShowDokployActions } from "./servers/actions/show-dokploy-actions";
import { ShowStorageActions } from "./servers/actions/show-storage-actions";
import { ShowTraefikActions } from "./servers/actions/show-traefik-actions";
import { ToggleDockerCleanup } from "./servers/actions/toggle-docker-cleanup";
import { UpdateServer } from "./web-server/update-server";

export const WebServer = () => {
	const { data: webServerSettings } =
		api.settings.getWebServerSettings.useQuery();

	const { data: dokployVersion } = api.settings.getDokployVersion.useQuery();

	return (
		<div className="w-full">
			<div className="flex flex-col gap-1.5">
				<h2 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
					<ServerIcon className="size-5 text-muted-foreground" />
					Web Server
				</h2>
				<p className="text-sm text-muted-foreground">Reload or clean the web server.</p>
			</div>
			<div className="space-y-6 pt-6">
						<div className="grid md:grid-cols-2 gap-4">
							<ShowDokployActions />
							<ShowTraefikActions />
							<ShowStorageActions />

							<UpdateServer />
						</div>

						<div className="flex items-center flex-wrap justify-between gap-4">
							<span className="text-sm text-muted-foreground">
								Server IP: {webServerSettings?.serverIp}
							</span>
							<span className="text-sm text-muted-foreground">
								Version: {dokployVersion}
							</span>

							<ToggleDockerCleanup />
						</div>
					</div>
		</div>
	);
};

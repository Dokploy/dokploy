import { Gauge, ServerIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "@/utils/api";
import { ShowDokployActions } from "./servers/actions/show-dokploy-actions";
import { ShowStorageActions } from "./servers/actions/show-storage-actions";
import { ShowTraefikActions } from "./servers/actions/show-traefik-actions";
import { ToggleDockerCleanup } from "./servers/actions/toggle-docker-cleanup";
import { Button } from "@/components/ui/button";
import { UpdateServer } from "./web-server/update-server";

export const WebServer = () => {
	const { data: webServerSettings, refetch } =
		api.settings.getWebServerSettings.useQuery();

	const { data: dokployVersion } = api.settings.getDokployVersion.useQuery();
	const [localConcurrency, setLocalConcurrency] = useState(1);
	const {
		mutateAsync: updateLocalConcurrency,
		isLoading: isUpdatingConcurrency,
	} = api.settings.updateLocalDeploymentConcurrency.useMutation();
	const currentLocalConcurrency =
		webServerSettings?.localDeploymentConcurrency || 1;
	const hasConcurrencyChanges = localConcurrency !== currentLocalConcurrency;
	const clampConcurrency = (value: number) => Math.min(5, Math.max(1, value));

	useEffect(() => {
		setLocalConcurrency(webServerSettings?.localDeploymentConcurrency || 1);
	}, [webServerSettings?.localDeploymentConcurrency]);

	return (
		<div className="w-full">
			{/* <Card className={cn("rounded-lg w-full bg-transparent p-0", className)}></Card> */}
			<Card className="h-full bg-sidebar  p-2.5 rounded-xl  max-w-5xl mx-auto">
				<div className="rounded-xl bg-background shadow-md ">
					<CardHeader className="">
						<CardTitle className="text-xl flex flex-row gap-2">
							<ServerIcon className="size-6 text-muted-foreground self-center" />
							Web Server
						</CardTitle>
						<CardDescription>Reload or clean the web server.</CardDescription>
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
						{webServerSettings && (
							<div className="rounded-md border bg-muted/20 px-3 py-2">
								<div className="flex flex-wrap items-center justify-between gap-2">
									<div className="flex min-w-0 items-center gap-2">
										<Gauge className="size-4 text-muted-foreground" />
										<span className="text-sm font-medium">
											Local Concurrent Builds
										</span>
										<span className="text-xs text-muted-foreground">1-5</span>
										<span className="rounded border bg-background px-2 py-0.5 text-xs text-muted-foreground">
											Current {currentLocalConcurrency}
										</span>
									</div>
									<div className="flex items-center gap-2">
										<Input
											type="number"
											min={1}
											max={5}
											value={localConcurrency}
											onChange={(e) => {
												const value = Number.parseInt(
													e.target.value || "1",
													10,
												);
												if (Number.isNaN(value)) {
													setLocalConcurrency(1);
													return;
												}
												setLocalConcurrency(clampConcurrency(value));
											}}
											className="h-8 w-16 text-center text-sm font-medium"
										/>
										<Button
											type="button"
											size="sm"
											variant="ghost"
											disabled={!hasConcurrencyChanges || isUpdatingConcurrency}
											onClick={() =>
												setLocalConcurrency(currentLocalConcurrency)
											}
										>
											Reset
										</Button>
										<Button
											type="button"
											size="sm"
											variant="outline"
											isLoading={isUpdatingConcurrency}
											disabled={!hasConcurrencyChanges}
											onClick={async () => {
												try {
													await updateLocalConcurrency({
														localDeploymentConcurrency: localConcurrency,
													});
													await refetch();
													toast.success("Local concurrency updated");
												} catch {
													toast.error("Failed to update local concurrency");
												}
											}}
										>
											Save
										</Button>
									</div>
								</div>
							</div>
						)}

						<div className="flex items-center flex-wrap justify-between gap-4">
							<span className="text-sm text-muted-foreground">
								Server IP: {webServerSettings?.serverIp}
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

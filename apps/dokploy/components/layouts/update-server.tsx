import type { IUpdateData } from "@dokploy/server/index";
import { Download } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "@/utils/api";
import UpdateServer from "../dashboard/settings/web-server/update-server";
import { Button } from "../ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "../ui/tooltip";

const AUTO_CHECK_UPDATES_INTERVAL_MINUTES = 7;

export const UpdateServerButton = () => {
	const [updateData, setUpdateData] = useState<IUpdateData>({
		latestVersion: null,
		updateAvailable: false,
	});
	const { data: isCloud } = api.settings.isCloud.useQuery();
	const { mutateAsync: getUpdateData } =
		api.settings.getUpdateData.useMutation();
	const [isOpen, setIsOpen] = useState(false);

	const checkUpdatesIntervalRef = useRef<null | NodeJS.Timeout>(null);

	useEffect(() => {
		// Handling of automatic check for server updates
		if (isCloud) {
			return;
		}

		if (!localStorage.getItem("enableAutoCheckUpdates")) {
			// Enable auto update checking by default if user didn't change it
			localStorage.setItem("enableAutoCheckUpdates", "true");
		}

		const clearUpdatesInterval = () => {
			if (checkUpdatesIntervalRef.current) {
				clearInterval(checkUpdatesIntervalRef.current);
			}
		};

		const checkUpdates = async () => {
			try {
				if (localStorage.getItem("enableAutoCheckUpdates") !== "true") {
					return;
				}

				const fetchedUpdateData = await getUpdateData();

				if (fetchedUpdateData?.updateAvailable) {
					// Stop interval when update is available
					clearUpdatesInterval();
					setUpdateData(fetchedUpdateData);
				}
			} catch (error) {
				console.error("Error auto-checking for updates:", error);
			}
		};

		checkUpdatesIntervalRef.current = setInterval(
			checkUpdates,
			AUTO_CHECK_UPDATES_INTERVAL_MINUTES * 60000,
		);

		// Also check for updates on initial page load
		checkUpdates();

		return () => {
			clearUpdatesInterval();
		};
	}, []);

	return !isCloud && updateData.updateAvailable ? (
		<div className="border-t pt-4">
			<UpdateServer
				updateData={updateData}
				isOpen={isOpen}
				onOpenChange={setIsOpen}
			>
				<TooltipProvider delayDuration={0}>
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								variant={updateData ? "outline" : "secondary"}
								className="w-full"
								onClick={() => setIsOpen(true)}
							>
								<Download className="h-4 w-4 flex-shrink-0" />
								{updateData ? (
									<span className="font-medium truncate group-data-[collapsible=icon]:hidden">
										Update Available
									</span>
								) : (
									<span className="font-medium truncate group-data-[collapsible=icon]:hidden">
										Check for updates
									</span>
								)}
								{updateData && (
									<span className="absolute right-2 flex h-2 w-2 group-data-[collapsible=icon]:hidden">
										<span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
										<span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
									</span>
								)}
							</Button>
						</TooltipTrigger>
						{updateData && (
							<TooltipContent side="right" sideOffset={10}>
								<p>Update Available</p>
							</TooltipContent>
						)}
					</Tooltip>
				</TooltipProvider>
			</UpdateServer>
		</div>
	) : null;
};

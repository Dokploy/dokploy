import type { IUpdateData } from "@dokploy/server/index";
import { Download } from "lucide-react";
import { type ComponentProps, useEffect, useRef, useState } from "react";
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

export function SidebarUpdateButton({
	label,
	...props
}: ComponentProps<"button"> & { label: string }) {
	return (
		<TooltipProvider delayDuration={0}>
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						{...props}
						variant="outline"
						className="relative w-full"
						aria-label={label}
					>
						<Download className="h-4 w-4 shrink-0" />
						<span className="truncate group-data-[collapsible=icon]:hidden">
							{label}
						</span>
						<span
							aria-hidden="true"
							className="absolute right-2 flex size-2 group-data-[collapsible=icon]:hidden"
						>
							<span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75 motion-reduce:animate-none" />
							<span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
						</span>
					</Button>
				</TooltipTrigger>
				<TooltipContent side="right" sideOffset={10}>
					<p>{label}</p>
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
}

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
				<SidebarUpdateButton label="Update Available" />
			</UpdateServer>
		</div>
	) : null;
};

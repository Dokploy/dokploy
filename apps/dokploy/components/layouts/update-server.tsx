import { api } from "@/utils/api";
import type { IUpdateData } from "@dokploy/server/index";
import { useRouter } from "next/router";
import { useEffect, useRef, useState } from "react";
import UpdateServer from "../dashboard/settings/web-server/update-server";

const AUTO_CHECK_UPDATES_INTERVAL_MINUTES = 7;

export const UpdateServerButton = () => {
	const [updateData, setUpdateData] = useState<IUpdateData>({
		latestVersion: null,
		updateAvailable: false,
	});
	const router = useRouter();
	const { data: isCloud } = api.settings.isCloud.useQuery();
	const { mutateAsync: getUpdateData } =
		api.settings.getUpdateData.useMutation();

	const checkUpdatesIntervalRef = useRef<null | NodeJS.Timeout>(null);

	if (isCloud) {
		return null;
	}
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

	return (
		updateData.updateAvailable && (
			<div>
				<UpdateServer updateData={updateData} />
			</div>
		)
	);
};

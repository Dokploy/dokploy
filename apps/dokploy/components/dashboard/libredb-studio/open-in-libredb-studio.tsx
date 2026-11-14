import { useState } from "react";
import { toast } from "sonner";
import { InstallLibreDBStudioDialog } from "@/components/dashboard/libredb-studio/install-libredb-studio";
import {
	getOpenInStudioState,
	navigateLaunchTab,
	openLaunchTab,
	POPUP_BLOCKED_MESSAGE,
	type StudioDatabaseType,
} from "@/components/dashboard/libredb-studio/utils";
import { LibreDBStudioIcon } from "@/components/icons/data-tools-icons";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { api } from "@/utils/api";

export const useLibreDBStudioLaunch = () => {
	const { mutateAsync, isPending } = api.libredbStudio.launch.useMutation();

	const launch = async (input: {
		libredbStudioId: string;
		connectionId?: string;
	}) => {
		// Browsers allow window.open only within the click's user activation, which the awaited launch request can outlive, so the tab opens first and is navigated once the URL arrives.
		const tab = openLaunchTab(window);
		if (!tab) {
			toast.error(POPUP_BLOCKED_MESSAGE);
			return;
		}
		try {
			const { url } = await mutateAsync(input);
			navigateLaunchTab(tab, url);
		} catch (error) {
			tab.close();
			toast.error(
				error instanceof Error
					? error.message
					: "LibreDB Studio could not be opened",
			);
		}
	};

	return { launch, isLaunching: isPending };
};

interface Props {
	databaseType: StudioDatabaseType;
	databaseId: string;
}

export const OpenInLibreDBStudio = ({ databaseType, databaseId }: Props) => {
	const [installOpen, setInstallOpen] = useState(false);
	const { data: isCloud } = api.settings.isCloud.useQuery();
	const { data, error } = api.libredbStudio.forDatabase.useQuery(
		{ databaseType, databaseId },
		{ enabled: isCloud === false && databaseId !== "", refetchInterval: 10000 },
	);
	const { launch, isLaunching } = useLibreDBStudioLaunch();

	if (isCloud !== false) {
		return null;
	}

	const state = getOpenInStudioState(data, error?.message);

	if (state.kind === "hidden") {
		return null;
	}

	if (state.kind === "setup") {
		return (
			<InstallLibreDBStudioDialog
				environmentId={state.environmentId}
				defaultServerId={state.serverId}
				open={installOpen}
				onOpenChange={setInstallOpen}
			>
				<Button
					variant="outline"
					className="flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-offset-2"
				>
					<LibreDBStudioIcon className="size-4 mr-1" />
					Set up LibreDB Studio
				</Button>
			</InstallLibreDBStudioDialog>
		);
	}

	if (state.kind === "disabled") {
		return (
			<TooltipProvider delayDuration={0}>
				<Tooltip>
					<TooltipTrigger asChild>
						<span className="inline-flex">
							<Button
								variant="outline"
								disabled
								className="flex items-center gap-1.5"
							>
								<LibreDBStudioIcon className="size-4 mr-1" />
								Open in LibreDB Studio
							</Button>
						</span>
					</TooltipTrigger>
					<TooltipContent sideOffset={5} className="z-60">
						<p>{state.reason}</p>
					</TooltipContent>
				</Tooltip>
			</TooltipProvider>
		);
	}

	return (
		<Button
			variant="outline"
			isLoading={isLaunching}
			onClick={() =>
				launch({
					libredbStudioId: state.libredbStudioId,
					connectionId: state.connectionId,
				})
			}
			className="flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-offset-2"
		>
			<LibreDBStudioIcon className="size-4 mr-1" />
			Open in LibreDB Studio
		</Button>
	);
};

import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { api } from "@/utils/api";

interface Props {
	backupId: string;
	checkAvailability: boolean;
	isLoading: boolean;
	isBusy: boolean;
	onClick: () => Promise<void>;
}

export const ManualBackupButton = ({
	backupId,
	checkAvailability,
	isLoading,
	isBusy,
	onClick,
}: Props) => {
	const { data, isPending, isError } = api.backup.availability.useQuery(
		{ backupId },
		{
			enabled: checkAvailability && !isBusy,
			refetchInterval: 15_000,
			refetchOnWindowFocus: true,
			retry: false,
		},
	);
	const reason = !checkAvailability
		? null
		: isError
			? "Could not check backup availability. Check the service and server connection."
			: isPending
				? "Checking database availability..."
				: data?.available
					? null
					: (data?.reason ?? "The database is unavailable.");
	const disabled = isBusy || !!reason;

	return (
		<TooltipProvider delayDuration={0}>
			<Tooltip>
				<TooltipTrigger asChild>
					<fieldset
						className="inline-flex"
						tabIndex={disabled ? 0 : undefined}
						aria-label="Manual backup availability"
					>
						<Button
							type="button"
							variant="ghost"
							size="icon"
							className="size-8"
							aria-label="Run Manual Backup"
							disabled={disabled}
							isLoading={isLoading}
							onClick={onClick}
						>
							<Play className="size-4" />
						</Button>
					</fieldset>
				</TooltipTrigger>
				<TooltipContent>
					{reason ??
						(isBusy ? "A manual backup is running" : "Run Manual Backup")}
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
};

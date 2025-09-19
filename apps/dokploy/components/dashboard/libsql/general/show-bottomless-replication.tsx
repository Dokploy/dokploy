import { CheckIcon, ChevronsUpDown } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";
import { AlertBlock } from "@/components/shared/alert-block";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
} from "@/components/ui/command";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { api } from "@/utils/api";

interface Props {
	libsqlId: string;
	enableBottomlessReplication: boolean;
	bottomlessReplicationDestinationId?: string | null;
}

export const ShowBottomlessReplication = ({
	libsqlId,
	enableBottomlessReplication,
	bottomlessReplicationDestinationId,
}: Props) => {
	const utils = api.useUtils();
	const switchId = useId();
	const commandId = useId();
	const { mutateAsync, isLoading } = api.libsql.update.useMutation();
	const { data: destinations, isLoading: isLoadingDestinations } =
		api.destination.all.useQuery();
	const [isDestinationOpen, setIsDestinationOpen] = useState(false);

	const handleToggle = async (checked: boolean) => {
		try {
			await mutateAsync({
				libsqlId,
				enableBottomlessReplication: checked,
			});
			toast.success("Bottomless replication updated successfully");
			utils.libsql.one.invalidate({ libsqlId });
		} catch (error) {
			toast.error("Error updating bottomless replication");
		}
	};

	const handleDestinationSelect = async (destinationId: string | null) => {
		try {
			await mutateAsync({
				libsqlId,
				enableBottomlessReplication:
					destinationId === null ? false : enableBottomlessReplication,
				bottomlessReplicationDestinationId: destinationId,
			});
			toast.success("Bottomless replication destination updated successfully");
			utils.libsql.one.invalidate({ libsqlId });
			setIsDestinationOpen(false);
		} catch (error) {
			toast.error("Error updating bottomless replication destination");
		}
	};

	return (
		<Card className="bg-background">
			<CardHeader>
				<CardTitle className="text-xl">Bottomless Replication</CardTitle>
				<CardDescription>
					Bottomless replication allows automatically backing up your database
					to an S3-compatible storage.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				<AlertBlock type="warning">
					The service needs to be restarted for bottomless replication changes
					to take effect. Please redeploy the service after enabling or
					disabling this feature.
				</AlertBlock>

				<div className="flex items-center justify-between">
					<div className="space-y-1">
						<label htmlFor={switchId} className="text-sm font-medium">
							Enable Bottomless Replication
						</label>
						<p className="text-sm text-muted-foreground">
							Automatically replicate database changes to S3-compatible storage
						</p>
						{!bottomlessReplicationDestinationId && (
							<p className="text-sm text-orange-600">
								Select a destination above to enable bottomless replication
							</p>
						)}
					</div>
					<Switch
						id={switchId}
						checked={enableBottomlessReplication}
						onCheckedChange={handleToggle}
						disabled={isLoading || !bottomlessReplicationDestinationId}
					/>
				</div>

				<div className="space-y-2">
					<label htmlFor={commandId} className="text-sm font-medium">
						Destination
					</label>
					<p className="text-sm text-muted-foreground">
						Select the S3-compatible destination for bottomless replication
					</p>
					<Popover open={isDestinationOpen} onOpenChange={setIsDestinationOpen}>
						<PopoverTrigger asChild>
							<Button
								variant="outline"
								className={cn(
									"w-full justify-between !bg-input",
									!bottomlessReplicationDestinationId &&
										"text-muted-foreground",
								)}
							>
								{isLoadingDestinations
									? "Loading...."
									: bottomlessReplicationDestinationId
										? destinations?.find(
												(destination) =>
													destination.destinationId ===
													bottomlessReplicationDestinationId,
											)?.name
										: "Select Destination"}
								<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
							</Button>
						</PopoverTrigger>
						<PopoverContent className="p-0" align="start">
							<Command id={commandId}>
								<CommandInput
									placeholder="Search Destination..."
									className="h-9"
								/>
								{isLoadingDestinations && (
									<span className="py-6 text-center text-sm">
										Loading Destinations....
									</span>
								)}
								<CommandEmpty>No destinations found.</CommandEmpty>
								<ScrollArea className="h-64">
									<CommandGroup>
										{destinations?.map((destination) => (
											<CommandItem
												value={destination.destinationId}
												key={destination.destinationId}
												onSelect={() =>
													handleDestinationSelect(destination.destinationId)
												}
											>
												{destination.name}
												<CheckIcon
													className={cn(
														"ml-auto h-4 w-4",
														destination.destinationId ===
															bottomlessReplicationDestinationId
															? "opacity-100"
															: "opacity-0",
													)}
												/>
											</CommandItem>
										))}
										<CommandItem
											value="none"
											onSelect={() => handleDestinationSelect(null)}
										>
											None
											<CheckIcon
												className={cn(
													"ml-auto h-4 w-4",
													!bottomlessReplicationDestinationId
														? "opacity-100"
														: "opacity-0",
												)}
											/>
										</CommandItem>
									</CommandGroup>
								</ScrollArea>
							</Command>
						</PopoverContent>
					</Popover>
				</div>
			</CardContent>
		</Card>
	);
};

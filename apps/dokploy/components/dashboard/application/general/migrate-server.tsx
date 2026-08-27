import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { api } from "@/utils/api";
import { Server } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface Props {
	applicationId: string;
	applicationName: string;
	currentServerId?: string | null;
}

export const MigrateServerDialog = ({
	applicationId,
	applicationName,
	currentServerId,
}: Props) => {
	const [selectedServerId, setSelectedServerId] = useState<string>("");
	const [open, setOpen] = useState(false);

	const { data: servers } = api.server.all.useQuery();
	const { mutateAsync: createMigration, isLoading: isMigrating } =
		api.serviceMigration.create.useMutation();

	const { data: validation, isLoading: isValidating } =
		api.serviceMigration.validateServer.useQuery(
			{
				serverId: selectedServerId,
			},
			{
				enabled: !!selectedServerId && selectedServerId !== currentServerId,
			},
		);

	const availableServers = servers?.filter(
		(s) => s.serverId !== currentServerId,
	);

	const handleMigrate = async () => {
		if (!selectedServerId) {
			toast.error("Please select a target server");
			return;
		}

		try {
			await createMigration({
				serviceId: applicationId,
				serviceType: "application",
				serviceName: applicationName,
				targetServerId: selectedServerId,
			});

			toast.success(
				"Migration started! The application will be moved to the new server.",
			);
			setOpen(false);
			setSelectedServerId("");
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to start migration",
			);
		}
	};

	return (
		<AlertDialog open={open} onOpenChange={setOpen}>
			<AlertDialogTrigger asChild>
				<Button variant="outline" className="gap-2">
					<Server className="h-4 w-4" />
					Migrate to Another Server
				</Button>
			</AlertDialogTrigger>
			<AlertDialogContent className="max-w-2xl">
				<AlertDialogHeader>
					<AlertDialogTitle>
						Migrate Application to Another Server
					</AlertDialogTitle>
					<AlertDialogDescription>
						This will move the application and its data to another server. The
						application will be paused during migration.
					</AlertDialogDescription>
				</AlertDialogHeader>

				<div className="space-y-4 py-4">
					<div className="space-y-2">
						<label className="text-sm font-medium">Target Server</label>
						<Select
							value={selectedServerId}
							onValueChange={setSelectedServerId}
						>
							<SelectTrigger>
								<SelectValue placeholder="Select a server" />
							</SelectTrigger>
							<SelectContent>
								{availableServers?.map((server) => (
									<SelectItem key={server.serverId} value={server.serverId}>
										{server.name} ({server.ipAddress})
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					{selectedServerId && validation && (
						<div className="rounded-lg border p-4 space-y-2">
							<h4 className="font-medium text-sm">Server Validation</h4>
							{isValidating ? (
								<p className="text-sm text-muted-foreground">Validating...</p>
							) : validation.valid ? (
								<div className="space-y-1">
									<p className="text-sm text-green-600">
										✓ Server is ready for migration
									</p>
									{validation.resources && (
										<div className="text-xs text-muted-foreground space-y-1">
											<p>Available Disk: {validation.resources.diskSpace}</p>
											<p>Available Memory: {validation.resources.memory}</p>
											<p>CPU Cores: {validation.resources.cpu}</p>
										</div>
									)}
								</div>
							) : (
								<p className="text-sm text-destructive">
									✗ {validation.error || "Server validation failed"}
								</p>
							)}
						</div>
					)}

					<div className="rounded-lg bg-muted p-4 space-y-2">
						<h4 className="font-medium text-sm">Migration Process</h4>
						<ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
							<li>Validate target server</li>
							<li>Pause application on current server</li>
							<li>Backup application data and volumes</li>
							<li>Transfer data to target server</li>
							<li>Update application configuration</li>
							<li>Restore data on target server</li>
						</ol>
						<p className="text-xs text-muted-foreground mt-2">
							⚠️ The application will be unavailable during migration. You'll
							need to redeploy it on the new server after migration completes.
						</p>
					</div>
				</div>

				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction
						onClick={handleMigrate}
						disabled={
							!selectedServerId ||
							isMigrating ||
							(validation && !validation.valid)
						}
					>
						{isMigrating ? "Migrating..." : "Start Migration"}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
};

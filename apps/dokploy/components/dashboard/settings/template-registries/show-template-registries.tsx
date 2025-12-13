import {
	AlertTriangle,
	Check,
	ExternalLink,
	Loader2,
	MoreVertical,
	Plus,
	RefreshCw,
	Trash2,
	X,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AlertBlock } from "@/components/shared/alert-block";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { api } from "@/utils/api";
import { AddTemplateRegistry } from "./add-template-registry";

export const ShowTemplateRegistries = () => {
	const { data: registries, isLoading, refetch } =
		api.templateRegistry.all.useQuery();

	const { mutateAsync: toggleRegistry, isLoading: isToggling } =
		api.templateRegistry.toggle.useMutation({
			onSuccess: () => {
				refetch();
			},
		});

	const { mutateAsync: syncRegistry } = api.templateRegistry.sync.useMutation({
		onSuccess: () => {
			refetch();
		},
	});

	const { mutateAsync: removeRegistry, isLoading: isRemoving } =
		api.templateRegistry.remove.useMutation({
			onSuccess: () => {
				refetch();
			},
		});

	const [syncingId, setSyncingId] = useState<string | null>(null);

	const handleSync = async (templateRegistryId: string) => {
		setSyncingId(templateRegistryId);
		try {
			await syncRegistry({ templateRegistryId });
			toast.success("Registry synced successfully");
		} catch (error) {
			toast.error((error as Error).message || "Failed to sync registry");
		} finally {
			setSyncingId(null);
		}
	};

	const handleToggle = async (
		templateRegistryId: string,
		isEnabled: boolean,
	) => {
		try {
			await toggleRegistry({ templateRegistryId, isEnabled });
			toast.success(
				isEnabled ? "Registry enabled" : "Registry disabled",
			);
		} catch (error) {
			toast.error((error as Error).message || "Failed to toggle registry");
		}
	};

	const handleRemove = async (templateRegistryId: string) => {
		try {
			await removeRegistry({ templateRegistryId });
			toast.success("Registry removed successfully");
		} catch (error) {
			toast.error((error as Error).message || "Failed to remove registry");
		}
	};

	if (isLoading) {
		return (
			<div className="flex items-center justify-center h-64">
				<Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
			</div>
		);
	}

	return (
		<Card className="bg-sidebar p-2.5 rounded-xl w-full">
			<div className="rounded-xl bg-background shadow-md">
				<CardHeader className="flex flex-row items-center justify-between">
					<div>
						<CardTitle className="text-xl">Template Registries</CardTitle>
						<CardDescription>
							Manage template registries for deploying applications from
							templates
						</CardDescription>
					</div>
					<AddTemplateRegistry>
						<Button variant="default" className="gap-2">
							<Plus className="h-4 w-4" />
							Add Registry
						</Button>
					</AddTemplateRegistry>
				</CardHeader>
				<CardContent className="space-y-4">
					{registries?.length === 0 ? (
						<div className="flex flex-col items-center justify-center py-12 text-center">
							<AlertTriangle className="h-12 w-12 text-muted-foreground mb-4" />
							<p className="text-lg font-medium text-muted-foreground">
								No template registries configured
							</p>
							<p className="text-sm text-muted-foreground">
								Add a registry to start deploying templates
							</p>
						</div>
					) : (
						<div className="grid gap-4">
							{registries?.map((registry) => (
								<Card
									key={registry.templateRegistryId}
									className="bg-transparent"
								>
									<CardContent className="p-4">
										<div className="flex items-start justify-between gap-4">
											<div className="flex-1 min-w-0">
												<div className="flex items-center gap-2 mb-1">
													<h3 className="font-medium truncate">
														{registry.name}
													</h3>
													{registry.isDefault && (
														<Badge variant="secondary" className="text-xs">
															Default
														</Badge>
													)}
													{registry.isEnabled ? (
														<Badge variant="green" className="text-xs">
															<Check className="h-3 w-3 mr-1" />
															Enabled
														</Badge>
													) : (
														<Badge variant="secondary" className="text-xs">
															<X className="h-3 w-3 mr-1" />
															Disabled
														</Badge>
													)}
												</div>
												{registry.description && (
													<p className="text-sm text-muted-foreground mb-2 line-clamp-2">
														{registry.description}
													</p>
												)}
												<div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
													<a
														href={registry.baseUrl}
														target="_blank"
														rel="noopener noreferrer"
														className="flex items-center gap-1 hover:text-foreground transition-colors"
													>
														<ExternalLink className="h-3 w-3" />
														{registry.baseUrl}
													</a>
													{registry.templateCount && (
														<span>
															{registry.templateCount} templates
														</span>
													)}
													{registry.lastSyncAt && (
														<span>
															Last synced:{" "}
															{new Date(registry.lastSyncAt).toLocaleDateString()}
														</span>
													)}
												</div>
											</div>

											<div className="flex items-center gap-2">
												<Switch
													checked={registry.isEnabled}
													onCheckedChange={(checked) =>
														handleToggle(
															registry.templateRegistryId,
															checked,
														)
													}
													disabled={isToggling}
												/>
												<DropdownMenu>
													<DropdownMenuTrigger asChild>
														<Button variant="ghost" size="icon">
															<MoreVertical className="h-4 w-4" />
														</Button>
													</DropdownMenuTrigger>
													<DropdownMenuContent align="end">
														<DropdownMenuItem
															onClick={() =>
																handleSync(registry.templateRegistryId)
															}
															disabled={syncingId === registry.templateRegistryId}
														>
															<RefreshCw
																className={`h-4 w-4 mr-2 ${
																	syncingId === registry.templateRegistryId
																		? "animate-spin"
																		: ""
																}`}
															/>
															Sync Templates
														</DropdownMenuItem>
														<DropdownMenuItem
															onClick={() =>
																window.open(registry.baseUrl, "_blank")
															}
														>
															<ExternalLink className="h-4 w-4 mr-2" />
															Open Registry
														</DropdownMenuItem>
														{!registry.isDefault && (
															<>
																<DropdownMenuSeparator />
																<DropdownMenuItem
																	onClick={() =>
																		handleRemove(registry.templateRegistryId)
																	}
																	disabled={isRemoving}
																	className="text-destructive focus:text-destructive"
																>
																	<Trash2 className="h-4 w-4 mr-2" />
																	Delete
																</DropdownMenuItem>
															</>
														)}
													</DropdownMenuContent>
												</DropdownMenu>
											</div>
										</div>
									</CardContent>
								</Card>
							))}
						</div>
					)}

					<AlertBlock type="info">
						Template registries are used to fetch application templates. The
						default registry is the official Dokploy template repository. You
						can add custom registries that follow the same format.
					</AlertBlock>
				</CardContent>
			</div>
		</Card>
	);
};


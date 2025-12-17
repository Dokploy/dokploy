import { format } from "date-fns";
import { Cloud, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
	CloudProviderIcon,
	HetznerIcon,
} from "@/components/icons/cloud-provider-icons";
import { DialogAction } from "@/components/shared/dialog-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { api } from "@/utils/api";
import { AddHetznerProvider } from "./hetzner/add-hetzner-provider";

const ProviderIcon = ({ provider }: { provider: string }) => {
	switch (provider) {
		case "hetzner":
			return <HetznerIcon className="size-5" />;
		default:
			return <Cloud className="size-5" />;
	}
};

const ProviderName = ({ provider }: { provider: string }) => {
	switch (provider) {
		case "hetzner":
			return "Hetzner Cloud";
		default:
			return provider;
	}
};

export const ShowCloudProviders = () => {
	const { data, isLoading, refetch } =
		api.cloudProvider.credentials.list.useQuery();
	const { mutateAsync: deleteCredential, isLoading: isDeleting } =
		api.cloudProvider.credentials.delete.useMutation();

	const handleDelete = async (credentialId: string) => {
		await deleteCredential({ credentialId })
			.then(async () => {
				toast.success("Cloud provider credentials removed successfully");
				await refetch();
			})
			.catch((error) => {
				toast.error(
					error?.message || "Error removing cloud provider credentials",
				);
			});
	};

	return (
		<div className="w-full">
			<Card className="h-full bg-sidebar p-2.5 rounded-xl max-w-5xl mx-auto">
				<div className="rounded-xl bg-background shadow-md">
					<CardHeader>
						<CardTitle className="text-xl flex flex-row gap-2">
							<CloudProviderIcon className="size-6 text-muted-foreground self-center" />
							Server Provisioning
						</CardTitle>
						<CardDescription>
							Connect cloud providers to enable one-click server provisioning
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-2 py-8 border-t">
						{isLoading ? (
							<div className="flex flex-row gap-2 items-center justify-center text-sm text-muted-foreground min-h-[25vh]">
								<span>Loading...</span>
								<Loader2 className="animate-spin size-4" />
							</div>
						) : (
							<>
								{data?.length === 0 ? (
									<div className="flex flex-col items-center gap-3 min-h-[25vh] justify-center">
										<CloudProviderIcon className="size-8 self-center text-muted-foreground" />
										<span className="text-base text-muted-foreground text-center">
											Add your first cloud provider to start provisioning
											servers
										</span>
										<div>
											<div className="flex items-center bg-sidebar p-1 w-full rounded-lg">
												<div className="flex flex-wrap items-center gap-4 p-3.5 rounded-lg bg-background border w-full [&>button]:grow">
													<AddHetznerProvider />
												</div>
											</div>
										</div>
									</div>
								) : (
									<div className="flex flex-col gap-4 min-h-[25vh]">
										<div className="flex flex-col gap-2 rounded-lg">
											<span className="text-base font-medium">
												Available Providers
											</span>
											<div className="flex items-center bg-sidebar p-1 w-full rounded-lg">
												<div className="flex flex-wrap items-center gap-4 p-3.5 rounded-lg bg-background border w-full [&>button]:grow">
													<AddHetznerProvider />
												</div>
											</div>
										</div>

										<div className="flex flex-col gap-2">
											<span className="text-base font-medium">
												Configured Providers
											</span>

											<div className="grid gap-4">
												{data?.map((credential) => (
													<Card key={credential.credentialId}>
														<CardContent className="p-6">
															<div className="flex items-center justify-between">
																<div className="flex items-center gap-4">
																	<div className="flex items-center justify-center w-12 h-12 rounded-lg bg-sidebar">
																		<ProviderIcon
																			provider={credential.provider}
																		/>
																	</div>
																	<div className="flex flex-col gap-1">
																		<div className="flex items-center gap-2">
																			<span className="font-medium">
																				<ProviderName
																					provider={credential.provider}
																				/>
																			</span>
																			<Badge
																				variant={
																					credential.isValid === "valid"
																						? "default"
																						: "destructive"
																				}
																			>
																				{credential.isValid === "valid"
																					? "Active"
																					: "Invalid"}
																			</Badge>
																		</div>
																		<div className="flex items-center gap-2 text-sm text-muted-foreground">
																			<span>
																				Added{" "}
																				{format(
																					new Date(credential.createdAt),
																					"PPP",
																				)}
																			</span>
																			{credential.lastValidated && (
																				<>
																					<span>•</span>
																					<span>
																						Last validated{" "}
																						{format(
																							new Date(
																								credential.lastValidated,
																							),
																							"PPP",
																						)}
																					</span>
																				</>
																			)}
																		</div>
																	</div>
																</div>

																<DialogAction
																	title="Delete Cloud Provider"
																	description={`Are you sure you want to remove ${ProviderName({ provider: credential.provider })}? This will not affect existing servers.`}
																	onClick={() =>
																		handleDelete(credential.credentialId)
																	}
																>
																	<Button
																		variant="ghost"
																		size="icon"
																		isLoading={isDeleting}
																	>
																		<Trash2 className="size-4 text-muted-foreground" />
																	</Button>
																</DialogAction>
															</div>
														</CardContent>
													</Card>
												))}
											</div>
										</div>
									</div>
								)}
							</>
						)}
					</CardContent>
				</div>
			</Card>
		</div>
	);
};

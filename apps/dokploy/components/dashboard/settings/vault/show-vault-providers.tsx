import { Loader2, Trash2, Vault } from "lucide-react";
import { toast } from "sonner";
import { vaultProviderIcons } from "@/components/icons/vault-provider-icons";
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
import { HandleVaultProvider } from "./handle-vault-provider";

const providerLabels: Record<string, string> = {
	hashicorp: "HashiCorp Vault",
	infisical: "Infisical",
	aws: "AWS Secrets Manager",
	doppler: "Doppler",
	azure: "Azure Key Vault",
	scaleway: "Scaleway Secret Manager",
	phase: "Phase",
};

export const ShowVaultProviders = () => {
	const { mutateAsync, isPending: isRemoving } =
		api.vaultProvider.remove.useMutation();
	const { data, isPending, refetch } = api.vaultProvider.all.useQuery();
	const { data: permissions } = api.user.getPermissions.useQuery();

	return (
		<div className="w-full">
			<Card className="h-full bg-sidebar p-2.5 rounded-xl max-w-5xl mx-auto">
				<div className="rounded-xl bg-background shadow-md">
					<CardHeader>
						<CardTitle className="text-xl flex flex-row gap-2">
							<Vault className="size-6 text-muted-foreground self-center" />
							Secrets Providers
						</CardTitle>
						<CardDescription>
							Connect external secret managers and reference their secrets in
							environment variables with{" "}
							<code>{"${{vault.<name>.<secret>}}"}</code>
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-2 py-8 border-t">
						{isPending ? (
							<div className="flex flex-row gap-2 items-center justify-center text-sm text-muted-foreground min-h-[25vh]">
								<span>Loading...</span>
								<Loader2 className="animate-spin size-4" />
							</div>
						) : (
							<>
								{data?.length === 0 ? (
									<div className="flex flex-col items-center gap-3 min-h-[25vh] justify-center">
										<Vault className="size-8 self-center text-muted-foreground" />
										<span className="text-base text-muted-foreground text-center">
											You don't have any secrets providers configured
										</span>
										{permissions?.vaultProvider.create && (
											<HandleVaultProvider />
										)}
									</div>
								) : (
									<div className="flex flex-col gap-4 min-h-[25vh]">
										<div className="flex flex-col gap-4 rounded-lg">
											{data?.map((provider) => {
												const ProviderIcon =
													vaultProviderIcons[provider.providerType];
												return (
													<div
														key={provider.vaultProviderId}
														className="flex items-center justify-between bg-sidebar p-1 w-full rounded-lg"
													>
														<div className="flex items-center justify-between p-3.5 rounded-lg bg-background border w-full">
															<div className="flex flex-row items-center gap-3">
																<ProviderIcon className="size-7 shrink-0" />
																<div className="flex gap-2 flex-col">
																	<span className="text-sm font-medium">
																		{provider.name}
																	</span>
																	<div className="flex flex-row gap-2 items-center">
																		{provider.assignments.length === 0 ? (
																			<Badge variant="destructive">
																				Not assigned
																			</Badge>
																		) : (
																			<Badge variant="secondary">
																				{provider.assignments.length}{" "}
																				{provider.assignments.length === 1
																					? "project"
																					: "projects"}
																			</Badge>
																		)}
																		<Badge variant="outline">
																			{providerLabels[provider.providerType] ??
																				provider.providerType}
																		</Badge>
																		<span className="text-xs text-muted-foreground">
																			{"${{vault." + provider.name + ".…}}"}
																		</span>
																	</div>
																</div>
															</div>

															<div className="flex flex-row gap-1">
																{permissions?.vaultProvider.update && (
																	<HandleVaultProvider
																		vaultProviderId={provider.vaultProviderId}
																	/>
																)}
																{permissions?.vaultProvider.delete && (
																	<DialogAction
																		title="Delete Secrets Provider"
																		description="Deployments referencing this provider will fail. Are you sure?"
																		type="destructive"
																		onClick={async () => {
																			await mutateAsync({
																				vaultProviderId:
																					provider.vaultProviderId,
																			})
																				.then(() => {
																					toast.success(
																						"Secrets provider deleted",
																					);
																					refetch();
																				})
																				.catch(() => {
																					toast.error(
																						"Error deleting the secrets provider",
																					);
																				});
																		}}
																	>
																		<Button
																			variant="ghost"
																			size="icon"
																			className="group hover:bg-red-500/10"
																			isLoading={isRemoving}
																		>
																			<Trash2 className="size-4 text-primary group-hover:text-red-500" />
																		</Button>
																	</DialogAction>
																)}
															</div>
														</div>
													</div>
												);
											})}
										</div>

										{permissions?.vaultProvider.create && (
											<div className="flex flex-row gap-2 flex-wrap w-full justify-end mr-4">
												<HandleVaultProvider />
											</div>
										)}
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

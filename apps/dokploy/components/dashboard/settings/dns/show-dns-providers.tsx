import { Globe, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { dnsProviderIcons } from "@/components/icons/dns-provider-icons";
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
import { HandleDnsProvider } from "./handle-dns-provider";
import { ShowDnsProviderZones } from "./show-dns-provider-zones";

const providerLabels: Record<string, string> = {
	cloudflare: "Cloudflare",
	route53: "AWS Route53",
};

export const ShowDnsProviders = () => {
	const { mutateAsync, isPending: isRemoving } =
		api.dnsProvider.remove.useMutation();
	const { data, isPending, refetch } = api.dnsProvider.all.useQuery();
	const { data: permissions } = api.user.getPermissions.useQuery();

	return (
		<div className="w-full">
			<Card className="h-full bg-sidebar p-2.5 rounded-xl max-w-5xl mx-auto">
				<div className="rounded-xl bg-background shadow-md">
					<CardHeader>
						<CardTitle className="text-xl flex flex-row gap-2">
							<Globe className="size-6 text-muted-foreground self-center" />
							DNS Providers
						</CardTitle>
						<CardDescription>
							Connect a DNS provider so Dokploy can create the A/CNAME record
							for a domain instead of you setting it up by hand.
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
										<Globe className="size-8 self-center text-muted-foreground" />
										<span className="text-base text-muted-foreground text-center">
											You don't have any DNS providers configured
										</span>
										{permissions?.dnsProvider.create && <HandleDnsProvider />}
									</div>
								) : (
									<div className="flex flex-col gap-4 min-h-[25vh]">
										<div className="flex flex-col gap-4 rounded-lg">
											{data?.map((provider) => {
												const ProviderIcon =
													dnsProviderIcons[provider.providerType];
												return (
													<div
														key={provider.dnsProviderId}
														className="flex items-center justify-between bg-sidebar p-1 w-full rounded-lg"
													>
														<div className="flex items-center justify-between p-3.5 rounded-lg bg-background border w-full">
															<div className="flex flex-row items-center gap-3">
																<ProviderIcon className="size-7 shrink-0" />
																<div className="flex gap-2 flex-col">
																	<span className="text-sm font-medium">
																		{provider.name}
																	</span>
																	<Badge variant="outline">
																		{providerLabels[provider.providerType] ??
																			provider.providerType}
																	</Badge>
																</div>
															</div>

															<div className="flex flex-row gap-1">
																<ShowDnsProviderZones
																	dnsProviderId={provider.dnsProviderId}
																	providerName={provider.name}
																/>
																{permissions?.dnsProvider.update && (
																	<HandleDnsProvider
																		dnsProviderId={provider.dnsProviderId}
																	/>
																)}
																{permissions?.dnsProvider.delete && (
																	<DialogAction
																		title="Delete DNS Provider"
																		description="Domains that rely on this provider to manage their records will need to be updated manually. Are you sure?"
																		type="destructive"
																		onClick={async () => {
																			await mutateAsync({
																				dnsProviderId: provider.dnsProviderId,
																			})
																				.then(() => {
																					toast.success("DNS provider deleted");
																					refetch();
																				})
																				.catch(() => {
																					toast.error(
																						"Error deleting the DNS provider",
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

										{permissions?.dnsProvider.create && (
											<div className="flex flex-row gap-2 flex-wrap w-full justify-end mr-4">
												<HandleDnsProvider />
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

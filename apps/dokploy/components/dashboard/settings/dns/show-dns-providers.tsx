import { EyeIcon, Globe, Loader2, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { dnsProviderIcons } from "@/components/icons/dns-provider-icons";
import { DialogAction } from "@/components/shared/dialog-action";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { api } from "@/utils/api";
import { HandleDnsProvider } from "./handle-dns-provider";

const providerLabels: Record<string, string> = {
	cloudflare: "Cloudflare",
	route53: "AWS Route53",
	porkbun: "Porkbun",
	infomaniak: "Infomaniak",
	ovh: "OVHcloud",
};

export const ShowDnsProviders = () => {
	const { t } = useTranslation();
	const [removingId, setRemovingId] = useState<string | null>(null);
	const { mutateAsync } = api.dnsProvider.remove.useMutation();
	const { data, isPending, refetch } = api.dnsProvider.all.useQuery();
	const { data: permissions } = api.user.getPermissions.useQuery();

	return (
		<div className="w-full max-w-5xl mx-auto">
			<Card className="h-full bg-sidebar p-2.5 rounded-xl">
				<div className="rounded-xl bg-background shadow-md">
					<div className="flex flex-wrap items-center justify-between gap-4 p-6">
						<CardHeader className="flex-1 p-0">
							<CardTitle className="text-xl flex flex-row gap-2">
								<Globe className="size-6 text-muted-foreground self-center" />
								{t("settings.dns.showProviders.title")}
							</CardTitle>
							<CardDescription>
								{t("settings.dns.showProviders.description")}
							</CardDescription>
						</CardHeader>
						{permissions?.dnsProvider.create && <HandleDnsProvider />}
					</div>

					<CardContent className="flex min-h-[60vh] flex-col gap-4 border-t py-8">
						{isPending ? (
							<div className="flex flex-1 flex-row items-center justify-center gap-2 text-sm text-muted-foreground">
								<span>{t("settings.servers.show.loading")}</span>
								<Loader2 className="animate-spin size-4" />
							</div>
						) : data?.length === 0 ? (
							<div className="flex min-h-[50vh] flex-col items-center justify-center gap-3">
								<Globe className="size-8 text-muted-foreground" />
								<span className="font-medium text-muted-foreground">
									{t("settings.dns.showProviders.emptyState")}
								</span>
								<span className="max-w-sm text-center text-sm text-muted-foreground">
									{t("settings.dns.showProviders.emptyStateHint")}
								</span>
							</div>
						) : (
							<ul className="flex flex-col gap-2">
								{data?.map((provider) => {
									const ProviderIcon = dnsProviderIcons[provider.providerType];
									const href = `/dashboard/settings/dns/${provider.dnsProviderId}`;
									return (
										<li
											key={provider.dnsProviderId}
											className="group relative flex items-center gap-3 rounded-lg border bg-background px-4 py-3 transition-colors duration-150 ease-out hover:border-foreground/20 hover:bg-muted/50 focus-within:border-ring"
										>
											<Link
												href={href}
												aria-label={t(
													"settings.dns.showProviders.viewDomainsAria",
													{
														name: provider.name,
													},
												)}
												className="absolute inset-0 rounded-lg outline-none"
											/>
											<ProviderIcon className="size-7 shrink-0" />
											<div className="flex min-w-0 flex-col gap-0.5">
												<span className="truncate text-sm font-medium">
													{provider.name}
												</span>
												<span className="text-xs text-muted-foreground">
													{providerLabels[provider.providerType] ??
														provider.providerType}
												</span>
											</div>

											<div className="relative z-10 ml-auto flex flex-row items-center gap-1">
												<Tooltip>
													<TooltipTrigger asChild>
														<Button
															variant="ghost"
															size="icon"
															className="text-muted-foreground"
															asChild
														>
															<Link href={href}>
																<EyeIcon className="size-4" />
																<span className="sr-only">
																	{t("settings.dns.showProviders.viewDomains")}
																</span>
															</Link>
														</Button>
													</TooltipTrigger>
													<TooltipContent>
														{t("settings.dns.showProviders.viewDomains")}
													</TooltipContent>
												</Tooltip>

												{permissions?.dnsProvider.update && (
													<HandleDnsProvider
														dnsProviderId={provider.dnsProviderId}
													/>
												)}
												{permissions?.dnsProvider.delete && (
													<Tooltip>
														<DialogAction
															title={t(
																"settings.dns.showProviders.deleteTitle",
															)}
															description={t(
																"settings.dns.showProviders.deleteDescription",
															)}
															type="destructive"
															onClick={async () => {
																setRemovingId(provider.dnsProviderId);
																await mutateAsync({
																	dnsProviderId: provider.dnsProviderId,
																})
																	.then(() => {
																		toast.success(
																			t("settings.dns.showProviders.deleted"),
																		);
																		refetch();
																	})
																	.catch(() => {
																		toast.error(
																			t(
																				"settings.dns.showProviders.deleteError",
																			),
																		);
																	})
																	.finally(() => setRemovingId(null));
															}}
														>
															<TooltipTrigger asChild>
																<Button
																	variant="ghost"
																	size="icon"
																	className="text-muted-foreground hover:bg-red-500/10 hover:text-red-500"
																	isLoading={
																		removingId === provider.dnsProviderId
																	}
																>
																	<Trash2 className="size-4" />
																	<span className="sr-only">
																		{t(
																			"settings.dns.showProviders.deleteProvider",
																		)}
																	</span>
																</Button>
															</TooltipTrigger>
														</DialogAction>
														<TooltipContent>
															{t("settings.dns.showProviders.deleteProvider")}
														</TooltipContent>
													</Tooltip>
												)}
											</div>
										</li>
									);
								})}
							</ul>
						)}
					</CardContent>
				</div>
			</Card>
		</div>
	);
};

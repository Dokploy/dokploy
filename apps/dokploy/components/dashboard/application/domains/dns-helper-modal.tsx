import { Copy, DatabaseZap, HelpCircle, Loader2, Server } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AlertBlock } from "@/components/shared/alert-block";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { api } from "@/utils/api";

interface Props {
	domain: {
		host: string;
		https: boolean;
		path?: string;
	};
	domainId?: string;
	dnsProvider?: {
		name: string;
		providerType: string;
	} | null;
	serverIp?: string;
}

export const DnsHelperModal = ({
	domain,
	domainId,
	dnsProvider,
	serverIp,
}: Props) => {
	const [isOpen, setIsOpen] = useState(false);
	const { data: dnsInfo, isLoading: isLoadingDnsInfo } =
		api.domain.dnsInfo.useQuery(
			{ domainId: domainId || "" },
			{ enabled: isOpen && !!dnsProvider && !!domainId },
		);
	const copyToClipboard = (text: string) => {
		navigator.clipboard.writeText(text);
		toast.success("Copied to clipboard!");
	};

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger>
				<Button variant="ghost" size="icon" className="group">
					<HelpCircle className="size-4" />
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<Server className="size-5" />
						DNS Configuration Guide
					</DialogTitle>
					<DialogDescription>
						Follow these steps to configure your DNS records for {domain.host}
					</DialogDescription>
				</DialogHeader>

				<div className="flex flex-col gap-4">
					{dnsProvider ? (
						<AlertBlock type="info">
							DNS is managed automatically through {dnsProvider.name}.
						</AlertBlock>
					) : (
						<AlertBlock type="info">
							To make your domain accessible, you need to configure your DNS
							records with your domain provider (e.g., Cloudflare, GoDaddy,
							NameCheap).
						</AlertBlock>
					)}

					<div className="flex flex-col gap-6">
						{dnsProvider ? (
							<div className="rounded-lg border p-4">
								<h3 className="font-medium mb-3 flex items-center gap-2">
									<DatabaseZap className="size-4" />
									1. Autoconfig
								</h3>
								{isLoadingDnsInfo ? (
									<div className="flex items-center gap-2 text-sm text-muted-foreground">
										<Loader2 className="size-4 animate-spin" />
										Loading DNS zone...
									</div>
								) : (
									<div className="grid gap-2 rounded-md bg-muted p-3 text-sm">
										<p>
											<span className="font-medium">DNS Provider:</span>{" "}
											{dnsInfo?.provider.name || dnsProvider.name}
										</p>
										<p>
											<span className="font-medium">Provider Type:</span>{" "}
											{dnsInfo?.provider.providerType ||
												dnsProvider.providerType}
										</p>
										<p>
											<span className="font-medium">DNS Zone:</span>{" "}
											{dnsInfo?.zone.name || "Unavailable"}
										</p>
										{dnsInfo?.wildcard ? (
											<>
												<p>
													<span className="font-medium">Wildcard:</span>{" "}
													{dnsInfo.wildcard.name} ({dnsInfo.wildcard.type})
												</p>
												<p>
													<span className="font-medium">Target:</span>{" "}
													{dnsInfo.wildcard.content}
												</p>
												<p className="text-muted-foreground">
													The wildcard covers this domain, so no dedicated
													record is needed.
												</p>
											</>
										) : (
											<p className="text-muted-foreground">
												A and AAAA records are created or updated automatically
												from the selected server addresses.
											</p>
										)}
									</div>
								)}
							</div>
						) : (
							<div className="rounded-lg border p-4">
								<h3 className="font-medium mb-2">1. Add A Record</h3>
								<div className="flex flex-col gap-3">
									<p className="text-sm text-muted-foreground">
										Create an A record that points your domain to the server's
										IP address:
									</p>
									<div className="flex flex-col gap-2">
										<div className="flex items-center justify-between gap-2 bg-muted p-3 rounded-md">
											<div>
												<p className="text-sm font-medium">Type: A</p>
												<p className="text-sm">
													Name: @ or {domain.host.split(".")[0]}
												</p>
												<p className="text-sm">
													Value: {serverIp || "Your server IP"}
												</p>
											</div>
											<Button
												variant="ghost"
												size="icon"
												onClick={() => copyToClipboard(serverIp || "")}
												disabled={!serverIp}
											>
												<Copy className="size-4" />
											</Button>
										</div>
									</div>
								</div>
							</div>
						)}

						<div className="rounded-lg border p-4">
							<h3 className="font-medium mb-2">2. Verify Configuration</h3>
							<div className="flex flex-col gap-3">
								<p className="text-sm text-muted-foreground">
									After configuring your DNS records:
								</p>
								<ul className="list-disc list-inside space-y-1 text-sm">
									<li>Wait for DNS propagation (usually 15-30 minutes)</li>
									<li>
										Test your domain by visiting:{" "}
										{domain.https ? "https://" : "http://"}
										{domain.host}
										{domain.path || "/"}
									</li>
									<li>Use a DNS lookup tool to verify your records</li>
								</ul>
							</div>
						</div>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
};

"use client";

import { api } from "@/utils/api";
import { formatDistanceToNow } from "date-fns";
import {
	CircleCheck,
	CircleX,
	Edit,
	MoreHorizontal,
	Server,
	ShieldCheck,
	Trash2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { toast } from "sonner";
import {
	Alert,
	AlertDescription,
	AlertTitle,
} from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
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
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { AddDNSProvider } from "./add-dns-provider";

type DnsProviders = {
	dnsProviderId: string;
	name: string;
	type: string;
	active: boolean;
	createdAt: string;
	organizationId: string;
};

const ShowDnsProviders = () => {
	const { t } = useTranslation();
	const [isOpen, setIsOpen] = useState(false);

	const { data, refetch } = api.dnsProvider.byOrganization.useQuery();
	const { mutateAsync: deleteDnsProvider, isLoading: isDeleting } =
		api.dnsProvider.delete.useMutation({
		onSuccess: () => {
			toast.success("DNS Provider deleted successfully");
			refetch();
		},
		onError: (error) => {
			toast.error(error.message);
		},
	});

	const { mutateAsync: toggleStatus, isLoading: isToggling } =
		api.dnsProvider.toggleStatus.useMutation({
		onSuccess: () => {
			toast.success("DNS Provider status updated");
			refetch();
		},
		onError: (error) => {
			toast.error(error.message);
		},
	});

	const dnsProviders = data || [];

	const handleDelete = async (dnsProvider: DnsProviders) => {
		const confirmed = window.confirm(
			`Are you sure you want to delete "${dnsProvider.name}"? This will affect wildcard domain SSL certificate generation.`
		);

		if (confirmed) {
			await deleteDnsProvider({
				dnsProviderId: dnsProvider.dnsProviderId,
			});
		}
	};

	const handleToggleStatus = async (dnsProvider: DnsProviders) => {
		await toggleStatus({
			dnsProviderId: dnsProvider.dnsProviderId,
		});
	};

	const getProviderIcon = (type: string) => {
		switch (type) {
			case "cloudflare":
				return "🌤️";
			case "route53":
				return "☁️";
			case "digitalocean":
				return "🌊";
			case "namecheap":
				return "💰";
			case "gandi":
				return "🔮";
			case "azure":
				return "☁️";
			case "google":
				return "🔍";
			default:
				return "🌐";
		}
	};

	const getProviderDisplayName = (type: string) => {
		switch (type) {
			case "cloudflare":
				return "Cloudflare";
			case "route53":
				return "Amazon Route53";
			case "digitalocean":
				return "DigitalOcean";
			case "namecheap":
				return "Namecheap";
			case "gandi":
				return "Gandi";
			case "azure":
				return "Microsoft Azure";
			case "google":
				return "Google Cloud DNS";
			default:
				return type;
		}
	};

	const getProviderDescription = (type: string) => {
		switch (type) {
			case "cloudflare":
				return "Fast, reliable DNS with API support";
			case "route53":
				return "AWS managed DNS service";
			case "digitalocean":
				return "Simple DNS management for DigitalOcean domains";
			case "namecheap":
				return "Affordable domain registration and DNS";
			case "gandi":
				return "Ethical domain registrar with DNS services";
			case "azure":
				return "Microsoft Azure DNS services";
			case "google":
				return "Google Cloud Platform DNS";
			default:
				return "DNS provider for wildcard SSL certificates";
		}
	};

	return (
		<div className="flex flex-col gap-4">
			<div className="flex items-center justify-between">
				<div>
					<h3 className="text-lg font-semibold">DNS Providers</h3>
					<p className="text-sm text-muted-foreground">
						Manage DNS providers for wildcard domain SSL certificate support
					</p>
				</div>
				<Button onClick={() => setIsOpen(true)}>
					<Server className="mr-2 h-4 w-4" />
					Add DNS Provider
				</Button>
			</div>

			{dnsProviders.length === 0 ? (
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<ShieldCheck className="h-5 w-5" />
							No DNS Providers
						</CardTitle>
						<CardDescription>
							Add a DNS provider to enable automatic wildcard SSL certificates for your domains
						</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="grid gap-4">
							<Alert>
								<CircleCheck className="h-4 w-4" />
								<AlertTitle>Wildcard SSL Support</AlertTitle>
								<AlertDescription>
									When you add a DNS provider, Dokploy can automatically request wildcard SSL
									certificates (e.g., *.example.com) using DNS challenges, which are required for
									wildcard domains by Let's Encrypt.
								</AlertDescription>
							</Alert>
						</div>
					</CardContent>
					<CardFooter>
						<Button onClick={() => setIsOpen(true)} className="w-full">
							Add Your First DNS Provider
						</Button>
					</CardFooter>
				</Card>
			) : (
				<Card>
					<CardHeader>
						<CardTitle>Configured DNS Providers</CardTitle>
						<CardDescription>
							These DNS providers are used to solve ACME challenges for wildcard SSL certificates
						</CardDescription>
					</CardHeader>
					<CardContent>
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Provider</TableHead>
									<TableHead>Type</TableHead>
									<TableHead>Status</TableHead>
									<TableHead>Created</TableHead>
									<TableHead className="text-right">Actions</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{dnsProviders.map((dnsProvider) => (
									<TableRow key={dnsProvider.dnsProviderId}>
										<TableCell>
											<div className="flex items-center gap-2">
												<span className="text-lg">{getProviderIcon(dnsProvider.type)}</span>
												<div>
													<div className="font-medium">{dnsProvider.name}</div>
													<div className="text-sm text-muted-foreground">
														{getProviderDescription(dnsProvider.type)}
													</div>
												</div>
											</div>
										</TableCell>
										<TableCell>
											<Badge variant="outline">
												{getProviderDisplayName(dnsProvider.type)}
											</Badge>
										</TableCell>
										<TableCell>
											<div className="flex items-center gap-2">
												{dnsProvider.active ? (
													<>
														<CircleCheck className="h-4 w-4 text-green-500" />
														<span className="text-sm">Active</span>
													</>
												) : (
													<>
														<CircleX className="h-4 w-4 text-red-500" />
														<span className="text-sm">Inactive</span>
													</>
												)}
											</div>
										</TableCell>
										<TableCell className="text-sm text-muted-foreground">
											{formatDistanceToNow(new Date(dnsProvider.createdAt), {
												addSuffix: true,
											})}
										</TableCell>
										<TableCell className="text-right">
											<DropdownMenu>
												<DropdownMenuTrigger asChild>
													<Button variant="ghost" size="icon">
														<MoreHorizontal className="h-4 w-4" />
													</Button>
												</DropdownMenuTrigger>
												<DropdownMenuContent align="end">
													<DropdownMenuItem
														onClick={() => handleToggleStatus(dnsProvider)}
														disabled={isToggling}
													>
														<CircleCheck className="mr-2 h-4 w-4" />
														{dnsProvider.active ? "Deactivate" : "Activate"}
													</DropdownMenuItem>
													<DropdownMenuItem
														onClick={() => {
															// TODO: Implement edit functionality
															toast.info("Edit functionality coming soon");
														}}
													>
														<Edit className="mr-2 h-4 w-4" />
														Edit
													</DropdownMenuItem>
													<DropdownMenuSeparator />
													<DropdownMenuItem
														onClick={() => handleDelete(dnsProvider)}
														disabled={isDeleting}
														className="text-destructive"
													>
														<Trash2 className="mr-2 h-4 w-4" />
														Delete
													</DropdownMenuItem>
												</DropdownMenuContent>
											</DropdownMenu>
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</CardContent>
				</Card>
			)}

			<Alert>
				<ShieldCheck className="h-4 w-4" />
				<AlertTitle>How DNS Providers Work</AlertTitle>
				<AlertDescription>
					<ul className="list-disc list-inside space-y-1 mt-2 text-sm">
						<li>
							DNS providers are used to solve ACME DNS challenges for wildcard SSL certificates
						</li>
						<li>
							Only wildcard domains (e.g., *.example.com) require DNS challenge validation
						</li>
						<li>
							Regular domains continue to use HTTP challenge validation
						</li>
						<li>Make sure your API credentials have DNS management permissions</li>
						<li>
							Sensitive credentials are encrypted and stored securely in the database
						</li>
					</ul>
				</AlertDescription>
			</Alert>

			<AddDNSProvider
				open={isOpen}
				setOpen={setIsOpen}
				dnsProviders={dnsProviders}
			/>
		</div>
	);
};

export { ShowDnsProviders };
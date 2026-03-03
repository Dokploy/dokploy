"use client";

import React, { useState, useEffect } from "react";
import { api } from "@/utils/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Globe, Search, RefreshCw, Shield, Key, ExternalLink, Plus } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { type DomainProvider } from "@dokploy/server/db/schema/domain-provider";
import { DomainProviderIcon } from "../settings/domain-providers/domain-provider-icon";

interface UnifiedDomain {
	id: string;
	name: string;
	provider: string;
	providerType: "netlify" | "namecheap";
	status: "active" | "pending" | "expired";
	expiresAt?: string;
	autoRenew?: boolean;
	records?: number;
	isManaged?: boolean;
}

interface DomainsPageProps {
	providers: DomainProvider[];
}

export const DomainsPage: React.FC<DomainsPageProps> = ({ providers: initialProviders }) => {
	const [searchQuery, setSearchQuery] = useState("");
	const [selectedProvider, setSelectedProvider] = useState<string>("all");
	const [activeTab, setActiveTab] = useState("all-domains");

	const { data: providers } = api.domainProvider.byOrganization.useQuery(undefined, {
		initialData: initialProviders,
	});

	const { data: domains, refetch: refetchDomains, isLoading: isLoadingDomains } =
		api.domains.getAll.useQuery(
			{
				providerId: selectedProvider === "all" ? undefined : selectedProvider,
				search: searchQuery || undefined,
			},
			{
				enabled: providers && providers.length > 0,
			}
		);

	const { data: netlifyDomains, refetch: refetchNetlify } =
		api.domains.netlify.getAll.useQuery(undefined, {
			enabled: providers?.some((p) => p.type === "netlify" && p.active),
		});

	const { data: namecheapDomains, refetch: refetchNamecheap } =
		api.domains.namecheap.getAll.useQuery(undefined, {
			enabled: providers?.some((p) => p.type === "namecheap" && p.active),
		});

	const { mutateAsync: purchaseDomain, isLoading: isPurchasing } =
		api.domains.namecheap.purchase.useMutation({
			onSuccess: (result) => {
				toast.success(`Domain purchase initiated: ${result.message}`);
				refetchNamecheap();
				refetchDomains();
			},
			onError: (error) => {
				toast.error(`Purchase failed: ${error.message}`);
			},
		});

	const handleRefresh = () => {
		refetchDomains();
		refetchNetlify();
		refetchNamecheap();
	};

	const handlePurchase = async (domainName: string) => {
		try {
			// This would typically open a modal with purchase details
			// For now, we'll use a simplified purchase flow
			await purchaseDomain({
				domainName,
				years: 1,
				// Add required fields for Namecheap API
				firstName: "John",
				lastName: "Doe",
				address1: "123 Main St",
				city: "Anytown",
				stateProvince: "CA",
				postalCode: "12345",
				country: "US",
				phone: "+1.5555555555",
				emailAddress: "john@example.com",
				addFreeWhoisguard: true,
			});
		} catch (error) {
			// Error handling is done in the mutation callbacks
		}
	};

	const filteredDomains = domains?.filter((domain) => {
		const matchesSearch = domain.name.toLowerCase().includes(searchQuery.toLowerCase());
		const matchesProvider = selectedProvider === "all" || domain.provider === selectedProvider;
		return matchesSearch && matchesProvider;
	}) || [];

	const activeProviders = providers?.filter((p) => p.active) || [];

	if (!activeProviders.length) {
		return (
			<div className="container mx-auto py-8">
				<Card className="max-w-2xl mx-auto">
					<CardContent className="p-8 text-center">
						<Globe className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
						<CardTitle className="mb-4">No Domain Providers Configured</CardTitle>
						<p className="text-muted-foreground mb-6">
							To manage your domains, you first need to configure at least one domain provider in your settings.
						</p>
						<Button asChild>
							<a href="/dashboard/settings/providers">
								Configure Domain Providers
							</a>
						</Button>
					</CardContent>
				</Card>
			</div>
		);
	}

	return (
		<div className="container mx-auto py-8 space-y-6">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-3xl font-bold">Domains</h1>
					<p className="text-muted-foreground">
						Manage domains from your configured providers
					</p>
				</div>
				<div className="flex items-center gap-2">
					<Button
						variant="outline"
						onClick={handleRefresh}
						disabled={isLoadingDomains}
					>
						<RefreshCw className={`h-4 w-4 mr-2 ${isLoadingDomains ? "animate-spin" : ""}`} />
						Refresh
					</Button>
					{providers?.some((p) => p.type === "namecheap" && p.enablePurchase && p.active) && (
						<Button>
							<Plus className="h-4 w-4 mr-2" />
							Purchase Domain
						</Button>
					)}
				</div>
			</div>

			<div className="flex flex-col sm:flex-row gap-4">
				<div className="flex-1">
					<div className="relative">
						<Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
						<Input
							placeholder="Search domains..."
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
							className="pl-10"
						/>
					</div>
				</div>
				<Select value={selectedProvider} onValueChange={setSelectedProvider}>
					<SelectTrigger className="w-full sm:w-64">
						<SelectValue placeholder="Select provider" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">All Providers</SelectItem>
						{activeProviders.map((provider) => (
							<SelectItem key={provider.domainProviderId} value={provider.domainProviderId}>
								<div className="flex items-center gap-2">
									<DomainProviderIcon type={provider.type} />
									{provider.name}
								</div>
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			<Tabs value={activeTab} onValueChange={setActiveTab}>
				<TabsList>
					<TabsTrigger value="all-domains">All Domains</TabsTrigger>
					{netlifyDomains && netlifyDomains.length > 0 && (
						<TabsTrigger value="netlify">Netlify DNS</TabsTrigger>
					)}
					{namecheapDomains && namecheapDomains.length > 0 && (
						<TabsTrigger value="namecheap">Namecheap</TabsTrigger>
					)}
				</TabsList>

				<TabsContent value="all-domains">
					<Card>
						<CardHeader>
							<CardTitle>All Domains ({filteredDomains.length})</CardTitle>
						</CardHeader>
						<CardContent>
							{filteredDomains.length === 0 ? (
								<div className="text-center py-8">
									<Globe className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
									<p>No domains found</p>
								</div>
							) : (
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>Domain Name</TableHead>
											<TableHead>Provider</TableHead>
											<TableHead>Status</TableHead>
											<TableHead>Records</TableHead>
											<TableHead>Expires</TableHead>
											<TableHead>Actions</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{filteredDomains.map((domain) => (
											<TableRow key={domain.id}>
												<TableCell className="font-medium">
													<div className="flex items-center gap-2">
														<Globe className="h-4 w-4 text-muted-foreground" />
														{domain.name}
													</div>
												</TableCell>
												<TableCell>
													<Badge variant="outline" className="flex items-center gap-1 w-fit">
														<DomainProviderIcon type={domain.providerType} />
														{domain.provider}
													</Badge>
												</TableCell>
												<TableCell>
													<Badge
														variant={
															domain.status === "active"
																? "default"
																: domain.status === "pending"
																	? "secondary"
																	: "destructive"
														}
													>
														{domain.status}
													</Badge>
												</TableCell>
												<TableCell>{domain.records || 0}</TableCell>
												<TableCell className="text-muted-foreground">
													{domain.expiresAt
														? formatDistanceToNow(new Date(domain.expiresAt), {
																addSuffix: true,
														  })
														: "N/A"}
												</TableCell>
												<TableCell>
													<Button variant="outline" size="sm">
														Manage
													</Button>
												</TableCell>
											</TableRow>
										))}
									</TableBody>
								</Table>
							)}
						</CardContent>
					</Card>
				</TabsContent>

				<TabsContent value="netlify">
					<Card>
						<CardHeader>
							<CardTitle>Netlify DNS Zones ({netlifyDomains?.length || 0})</CardTitle>
						</CardHeader>
						<CardContent>
							{/* Netlify specific domain management UI */}
							<div className="text-center py-8">
								<Shield className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
								<p>Netlify DNS zones management</p>
							</div>
						</CardContent>
					</Card>
				</TabsContent>

				<TabsContent value="namecheap">
					<Card>
						<CardHeader>
							<CardTitle>Namecheap Domains ({namecheapDomains?.length || 0})</CardTitle>
						</CardHeader>
						<CardContent>
							{/* Namecheap specific domain management UI */}
							<div className="text-center py-8">
								<Key className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
								<p>Namecheap domains management</p>
							</div>
						</CardContent>
					</Card>
				</TabsContent>
			</Tabs>
		</div>
	);
};
"use client";

import { api } from "@/utils/api";
import { formatDistanceToNow } from "date-fns";
import { Globe, Edit, Trash2, MoreHorizontal, Shield, Key, TestTube, Link2, CheckCircle, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
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
import { useState } from "react";
import { AddDomainProvider } from "./add-domain-provider";
import { type DomainProvider } from "@dokploy/server/db/schema/domain-provider";

export const ShowDomainProviders = () => {
	const [isAddModalOpen, setIsAddModalOpen] = useState(false);
	const { data, refetch } = api.domainProvider.byOrganization.useQuery();
	const { mutateAsync: deleteDomainProvider, isLoading: isDeleting } =
		api.domainProvider.delete.useMutation({
			onSuccess: () => {
				toast.success("Domain provider deleted successfully");
				refetch();
			},
			onError: (error) => {
				toast.error(error.message);
			},
		});

	const { mutateAsync: toggleStatus, isLoading: isToggling } =
		api.domainProvider.toggleStatus.useMutation({
			onSuccess: () => {
				toast.success("Domain provider status updated");
				refetch();
			},
			onError: (error) => {
				toast.error(error.message);
			},
		});

	const { mutateAsync: testConnection, isLoading: isTesting } =
		api.domainProvider.testConnection.useMutation({
			onSuccess: (result) => {
				if (result.requiresOAuth) {
					toast.info(result.message);
				} else {
					toast.success(`Connection test successful: ${result.message}`);
				}
			},
			onError: (error) => {
				toast.error(`Connection test failed: ${error.message}`);
			},
		});

	const { mutateAsync: connectOAuth, isLoading: isConnectingOAuth } =
		api.oauth.generateAuthUrl.useMutation({
			onError: (error) => {
				toast.error(`Failed to generate OAuth URL: ${error.message}`);
			},
		});

	const handleDelete = async (provider: DomainProvider) => {
		if (
			confirm(
				`Are you sure you want to delete "${provider.name}"? This action cannot be undone.`
			)
		) {
			await deleteDomainProvider({ domainProviderId: provider.domainProviderId });
		}
	};

	const handleToggleStatus = async (provider: DomainProvider) => {
		await toggleStatus({ domainProviderId: provider.domainProviderId });
	};

	const handleTestConnection = async (provider: DomainProvider) => {
		await testConnection({ domainProviderId: provider.domainProviderId });
	};

	const handleConnectOAuth = async (provider: DomainProvider) => {
		const result = await connectOAuth({ domainProviderId: provider.domainProviderId });
		if (result?.authUrl) {
			// Open OAuth URL in a new window
			window.open(result.authUrl, "netlify-oauth", "width=500,height=600");
			toast.info("Opening OAuth authorization window...");
		}
	};

	const providers = data || [];

	const getProviderIcon = (type: string) => {
		switch (type) {
			case "netlify":
				return <Shield className="h-4 w-4" />;
			case "namecheap":
				return <Key className="h-4 w-4" />;
			default:
				return <Globe className="h-4 w-4" />;
		}
	};

	const getProviderTypeLabel = (type: string) => {
		switch (type) {
			case "netlify":
				return "Netlify DNS";
			case "namecheap":
				return "Namecheap";
			default:
				return type;
		}
	};

	return (
		<div className="w-full">
			<Card className="h-full bg-sidebar p-2.5 rounded-xl max-w-5xl mx-auto">
				<div className="rounded-xl bg-background shadow-md">
					<CardHeader>
						<div className="flex items-center justify-between">
							<CardTitle>Domain Providers</CardTitle>
							<Button onClick={() => setIsAddModalOpen(true)}>
								<Globe className="h-4 w-4 mr-2" />
								Add Domain Provider
							</Button>
						</div>
					</CardHeader>
					<CardContent>
						{providers.length === 0 ? (
							<div className="text-center py-8">
								<Globe className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
								<h3 className="text-lg font-semibold mb-2">No domain providers configured</h3>
								<p className="text-muted-foreground mb-4">
									Add your first domain provider to start managing domains
								</p>
								<Button onClick={() => setIsAddModalOpen(true)}>
									<Globe className="h-4 w-4 mr-2" />
									Add Domain Provider
								</Button>
							</div>
						) : (
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Name</TableHead>
										<TableHead>Type</TableHead>
										<TableHead>Auth Method</TableHead>
										<TableHead>Status</TableHead>
										<TableHead>Purchase</TableHead>
										<TableHead>Added</TableHead>
										<TableHead className="w-[100px]">Actions</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{providers.map((provider) => (
										<TableRow key={provider.domainProviderId}>
											<TableCell className="font-medium">
												<div className="flex items-center gap-2">
													{getProviderIcon(provider.type)}
													{provider.name}
												</div>
											</TableCell>
											<TableCell>
												<Badge variant="outline" className="flex items-center gap-1 w-fit">
													{getProviderIcon(provider.type)}
													{getProviderTypeLabel(provider.type)}
												</Badge>
											</TableCell>
											<TableCell>
												{provider.type === "netlify" && (
													<Badge variant={provider.authMethod === "oauth" ? "default" : "secondary"} className="flex items-center gap-1">
														{provider.authMethod === "oauth" ? (
															<Shield className="h-3 w-3" />
														) : (
															<Key className="h-3 w-3" />
														)}
														{provider.authMethod === "oauth" ? "OAuth" : "Direct"}
													</Badge>
												)}
												{provider.type === "namecheap" && (
													<Badge variant="outline">N/A</Badge>
												)}
											</TableCell>
											<TableCell>
												<Badge variant={provider.active ? "default" : "secondary"}>
													{provider.active ? "Active" : "Inactive"}
												</Badge>
											</TableCell>
											<TableCell>
												{provider.type === "namecheap" && provider.enablePurchase ? (
													<Badge variant="default">Enabled</Badge>
												) : (
													<Badge variant="outline">N/A</Badge>
												)}
											</TableCell>
											<TableCell className="text-muted-foreground">
												{formatDistanceToNow(new Date(provider.createdAt), {
													addSuffix: true,
												})}
											</TableCell>
											<TableCell>
												<DropdownMenu>
													<DropdownMenuTrigger asChild>
														<Button
															variant="ghost"
															size="icon"
															disabled={
																isDeleting || isToggling || isTesting || isConnectingOAuth
															}
														>
															<MoreHorizontal className="h-4 w-4" />
														</Button>
													</DropdownMenuTrigger>
													<DropdownMenuContent align="end">
														{provider.type === "netlify" && provider.authMethod === "oauth" && (
															<DropdownMenuItem
																onClick={() => handleConnectOAuth(provider)}
																disabled={isConnectingOAuth}
															>
																<Link2 className="h-4 w-4 mr-2" />
																Connect OAuth
															</DropdownMenuItem>
														)}
														<DropdownMenuItem
															onClick={() => handleTestConnection(provider)}
															disabled={isTesting}
														>
															<TestTube className="h-4 w-4 mr-2" />
															Test Connection
														</DropdownMenuItem>
														<DropdownMenuItem
															onClick={() => handleToggleStatus(provider)}
															disabled={isToggling}
														>
															{provider.active ? "Deactivate" : "Activate"}
														</DropdownMenuItem>
														<DropdownMenuItem
															onClick={() => toast.info("Edit functionality coming soon")}
														>
															<Edit className="h-4 w-4 mr-2" />
															Edit
														</DropdownMenuItem>
														<DropdownMenuItem
															onClick={() => handleDelete(provider)}
															className="text-destructive"
															disabled={isDeleting}
														>
															<Trash2 className="h-4 w-4 mr-2" />
															Delete
														</DropdownMenuItem>
													</DropdownMenuContent>
												</DropdownMenu>
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						)}
					</CardContent>
				</div>
			</Card>
			<AddDomainProvider
				open={isAddModalOpen}
				setOpen={setIsAddModalOpen}
			/>
		</div>
	);
};
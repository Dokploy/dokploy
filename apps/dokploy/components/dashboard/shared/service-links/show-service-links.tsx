import { useState } from "react";
import { api } from "@/utils/api";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2, PlusIcon, Trash2, Edit, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { AddServiceLinkModal } from "./add-service-link-modal";
import { EditServiceLinkModal } from "./edit-service-link-modal";

interface Props {
	serviceId: string;
	serviceType: "application" | "compose" | "postgres" | "mysql" | "mariadb" | "mongo" | "redis";
	projectId: string;
}

export const ShowServiceLinks = ({ serviceId, serviceType, projectId }: Props) => {
	const [isAddModalOpen, setIsAddModalOpen] = useState(false);
	const [editingLink, setEditingLink] = useState<string | null>(null);

	const { data: serviceLinks, isLoading, refetch } = api.serviceLinks.list.useQuery({
		sourceServiceId: serviceId,
		sourceServiceType: serviceType,
	});

	const { mutateAsync: deleteServiceLink } = api.serviceLinks.delete.useMutation();

	const handleDeleteLink = async (linkId: string) => {
		try {
			await deleteServiceLink({ serviceLinkId: linkId });
			toast.success("Service link deleted successfully");
			refetch();
		} catch (error) {
			toast.error("Failed to delete service link");
		}
	};

	const getAttributeLabel = (attribute: string) => {
		switch (attribute) {
			case "fqdn":
				return "Public URL (FQDN)";
			case "hostname":
				return "Internal Hostname";
			case "port":
				return "Internal Port";
			default:
				return attribute;
		}
	};

	const getServiceTypeIcon = (type: string) => {
		switch (type) {
			case "application":
				return "🌐";
			case "compose":
				return "🔧";
			case "postgres":
				return "🐘";
			case "mysql":
				return "🐬";
			case "mariadb":
				return "🗄️";
			case "mongo":
				return "🍃";
			case "redis":
				return "🔴";
			default:
				return "📦";
		}
	};

	if (isLoading) {
		return (
			<Card>
				<CardHeader>
					<CardTitle>Service Links</CardTitle>
					<CardDescription>
						Manage dependencies between services in this project
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="flex items-center justify-center py-8">
						<Loader2 className="h-6 w-6 animate-spin" />
						<span className="ml-2">Loading service links...</span>
					</div>
				</CardContent>
			</Card>
		);
	}

	return (
		<Card>
			<CardHeader>
				<div className="flex items-center justify-between">
					<div>
						<CardTitle className="flex items-center gap-2">
							<ExternalLink className="h-5 w-5" />
							Service Links
						</CardTitle>
						<CardDescription>
							Link this service to other services and automatically inject their
							URLs, hostnames, or ports as environment variables
						</CardDescription>
					</div>
					<Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
						<DialogTrigger asChild>
							<Button>
								<PlusIcon className="h-4 w-4 mr-2" />
								Add Service Link
							</Button>
						</DialogTrigger>
						<DialogContent className="max-w-md">
							<AddServiceLinkModal
								sourceServiceId={serviceId}
								sourceServiceType={serviceType}
								projectId={projectId}
								onSuccess={() => {
									setIsAddModalOpen(false);
									refetch();
								}}
							/>
						</DialogContent>
					</Dialog>
				</div>
			</CardHeader>
			<CardContent className="space-y-4">
				{!serviceLinks || serviceLinks.length === 0 ? (
					<div className="text-center py-8">
						<ExternalLink className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
						<h3 className="text-lg font-medium mb-2">No service links</h3>
						<p className="text-muted-foreground mb-4">
							Create links to other services to automatically inject their
							connection details as environment variables.
						</p>
						<Button
							onClick={() => setIsAddModalOpen(true)}
							variant="outline"
						>
							<PlusIcon className="h-4 w-4 mr-2" />
							Add Your First Service Link
						</Button>
					</div>
				) : (
					<div className="space-y-3">
						{serviceLinks.map((link) => (
							<div
								key={link.serviceLinkId}
								className="flex items-center justify-between p-4 border rounded-lg"
							>
								<div className="flex-1">
									<div className="flex items-center gap-3 mb-2">
										<span className="text-sm">
											{getServiceTypeIcon(link.targetServiceType)}
										</span>
										<span className="font-medium">
											{link.targetService?.name || "Unknown Service"}
										</span>
										<Badge variant="secondary" className="text-xs">
											{link.targetServiceType}
										</Badge>
									</div>
									<div className="text-sm text-muted-foreground space-y-1">
										<div>
											<strong>Attribute:</strong> {getAttributeLabel(link.attribute)}
										</div>
										<div>
											<strong>Environment Variable:</strong>{" "}
											<code className="bg-muted px-1 py-0.5 rounded text-xs">
												{link.envVariableName}
											</code>
										</div>
										<div className="text-xs text-muted-foreground">
											Resolves to:{" "}
											<code className="bg-muted px-1 py-0.5 rounded">
												{`\${{service.${link.targetService?.appName || link.targetServiceId}.${link.attribute}}}`}
											</code>
										</div>
									</div>
								</div>
								<div className="flex items-center gap-2">
									<Dialog 
										open={editingLink === link.serviceLinkId} 
										onOpenChange={(open) => setEditingLink(open ? link.serviceLinkId : null)}
									>
										<DialogTrigger asChild>
											<Button variant="ghost" size="sm">
												<Edit className="h-4 w-4" />
											</Button>
										</DialogTrigger>
										<DialogContent className="max-w-md">
											<EditServiceLinkModal
												serviceLink={link}
												projectId={projectId}
												onSuccess={() => {
													setEditingLink(null);
													refetch();
												}}
											/>
										</DialogContent>
									</Dialog>
									<Button
										variant="ghost"
										size="sm"
										onClick={() => handleDeleteLink(link.serviceLinkId)}
									>
										<Trash2 className="h-4 w-4 text-destructive" />
									</Button>
								</div>
							</div>
						))}
					</div>
				)}

				{serviceLinks && serviceLinks.length > 0 && (
					<div className="mt-6 p-4 bg-muted/50 rounded-lg">
						<h4 className="font-medium mb-2">How it works</h4>
						<p className="text-sm text-muted-foreground">
							The environment variables created by these service links will be
							automatically injected into your service during deployment. The
							values will be resolved to the actual URLs, hostnames, or ports
							of the target services.
						</p>
					</div>
				)}
			</CardContent>
		</Card>
	);
};
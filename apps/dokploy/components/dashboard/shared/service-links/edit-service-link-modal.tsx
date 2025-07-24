import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { api } from "@/utils/api";
import { Button } from "@/components/ui/button";
import {
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { extractServices } from "@/pages/dashboard/project/[projectId]";

const editServiceLinkSchema = z.object({
	targetServiceId: z.string().min(1, "Please select a target service"),
	targetServiceType: z.enum([
		"application",
		"compose",
		"postgres",
		"mysql",
		"mariadb",
		"mongo",
		"redis",
	]),
	attribute: z.enum(["fqdn", "hostname", "port"]),
	envVariableName: z
		.string()
		.min(1, "Environment variable name is required")
		.regex(
			/^[A-Z][A-Z0-9_]*$/,
			"Environment variable must start with a letter and contain only uppercase letters, numbers, and underscores"
		),
});

type EditServiceLinkForm = z.infer<typeof editServiceLinkSchema>;

interface ServiceLink {
	serviceLinkId: string;
	sourceServiceId: string;
	sourceServiceType: string;
	targetServiceId: string;
	targetServiceType: string;
	attribute: string;
	envVariableName: string;
	targetService?: {
		name: string;
		appName: string;
	};
}

interface Props {
	serviceLink: ServiceLink;
	projectId: string;
	onSuccess: () => void;
}

export const EditServiceLinkModal = ({
	serviceLink,
	projectId,
	onSuccess,
}: Props) => {
	const [selectedService, setSelectedService] = useState<any>(null);

	const { data: project } = api.project.one.useQuery({ projectId });
	const { mutateAsync: updateServiceLink, isLoading } =
		api.serviceLinks.update.useMutation();

	const form = useForm<EditServiceLinkForm>({
		resolver: zodResolver(editServiceLinkSchema),
		defaultValues: {
			targetServiceId: serviceLink.targetServiceId,
			targetServiceType: serviceLink.targetServiceType as any,
			attribute: serviceLink.attribute as any,
			envVariableName: serviceLink.envVariableName,
		},
	});

	// Get all services in the project except the source one
	const availableServices = extractServices(project)?.filter(
		(service) => service.id !== serviceLink.sourceServiceId
	) || [];

	// Set initial selected service
	useEffect(() => {
		const initialService = availableServices.find(
			(service) => service.id === serviceLink.targetServiceId
		);
		if (initialService) {
			setSelectedService(initialService);
		}
	}, [availableServices, serviceLink.targetServiceId]);

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

	const getAttributeDescription = (attribute: string) => {
		switch (attribute) {
			case "fqdn":
				return "The fully qualified domain name (public URL) of the service";
			case "hostname":
				return "The internal hostname used for container-to-container communication";
			case "port":
				return "The internal port the service is listening on";
			default:
				return "";
		}
	};

	const generateEnvVarName = (serviceName: string, attribute: string) => {
		// Create a clean environment variable name
		const cleanName = serviceName
			.replace(/[^a-zA-Z0-9]/g, "_")
			.toUpperCase();
		const cleanAttribute = attribute.toUpperCase();
		return `${cleanName}_${cleanAttribute}`;
	};

	const handleServiceChange = (serviceId: string) => {
		const service = availableServices.find((s) => s.id === serviceId);
		if (service) {
			setSelectedService(service);
			form.setValue("targetServiceId", serviceId);
			form.setValue("targetServiceType", service.type as any);
			
			// Auto-generate environment variable name if user hasn't customized it
			const currentAttribute = form.getValues("attribute");
			const expectedEnvVarName = generateEnvVarName(
				selectedService?.name || "",
				currentAttribute
			);
			
			// Only auto-update if the current name matches the expected pattern
			if (form.getValues("envVariableName") === expectedEnvVarName || 
				form.getValues("envVariableName") === generateEnvVarName(selectedService?.name || "", currentAttribute)) {
				const envVarName = generateEnvVarName(service.name, currentAttribute);
				form.setValue("envVariableName", envVarName);
			}
		}
	};

	const handleAttributeChange = (attribute: string) => {
		form.setValue("attribute", attribute as any);
		if (selectedService) {
			// Auto-generate environment variable name if user hasn't customized it
			const currentAttribute = form.getValues("attribute");
			const expectedEnvVarName = generateEnvVarName(
				selectedService.name,
				currentAttribute
			);
			
			// Only auto-update if the current name matches the expected pattern
			if (form.getValues("envVariableName") === expectedEnvVarName) {
				const envVarName = generateEnvVarName(selectedService.name, attribute);
				form.setValue("envVariableName", envVarName);
			}
		}
	};

	const onSubmit = async (data: EditServiceLinkForm) => {
		try {
			await updateServiceLink({
				serviceLinkId: serviceLink.serviceLinkId,
				...data,
			});
			toast.success("Service link updated successfully");
			onSuccess();
		} catch (error: any) {
			toast.error(error.message || "Failed to update service link");
		}
	};

	return (
		<>
			<DialogHeader>
				<DialogTitle>Edit Service Link</DialogTitle>
				<DialogDescription>
					Update the target service, attribute, or environment variable name
					for this service link.
				</DialogDescription>
			</DialogHeader>

			<Form {...form}>
				<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
					<FormField
						control={form.control}
						name="targetServiceId"
						render={({ field }) => (
							<FormItem>
								<FormLabel>Target Service</FormLabel>
								<Select
									onValueChange={handleServiceChange}
									value={field.value}
								>
									<FormControl>
										<SelectTrigger>
											<SelectValue placeholder="Select a service to link to" />
										</SelectTrigger>
									</FormControl>
									<SelectContent>
										{availableServices.length === 0 ? (
											<div className="p-2 text-center text-muted-foreground">
												No other services available in this project
											</div>
										) : (
											availableServices.map((service) => (
												<SelectItem key={service.id} value={service.id}>
													<div className="flex items-center gap-2">
														<span>{getServiceTypeIcon(service.type)}</span>
														<span>{service.name}</span>
														<Badge variant="secondary" className="text-xs">
															{service.type}
														</Badge>
													</div>
												</SelectItem>
											))
										)}
									</SelectContent>
								</Select>
								<FormMessage />
							</FormItem>
						)}
					/>

					<FormField
						control={form.control}
						name="attribute"
						render={({ field }) => (
							<FormItem>
								<FormLabel>Service Attribute</FormLabel>
								<Select
									onValueChange={handleAttributeChange}
									value={field.value}
								>
									<FormControl>
										<SelectTrigger>
											<SelectValue placeholder="Select attribute to expose" />
										</SelectTrigger>
									</FormControl>
									<SelectContent>
										<SelectItem value="fqdn">
											<div className="space-y-1">
												<div>{getAttributeLabel("fqdn")}</div>
												<div className="text-xs text-muted-foreground">
													{getAttributeDescription("fqdn")}
												</div>
											</div>
										</SelectItem>
										<SelectItem value="hostname">
											<div className="space-y-1">
												<div>{getAttributeLabel("hostname")}</div>
												<div className="text-xs text-muted-foreground">
													{getAttributeDescription("hostname")}
												</div>
											</div>
										</SelectItem>
										<SelectItem value="port">
											<div className="space-y-1">
												<div>{getAttributeLabel("port")}</div>
												<div className="text-xs text-muted-foreground">
													{getAttributeDescription("port")}
												</div>
											</div>
										</SelectItem>
									</SelectContent>
								</Select>
								<FormMessage />
							</FormItem>
						)}
					/>

					<FormField
						control={form.control}
						name="envVariableName"
						render={({ field }) => (
							<FormItem>
								<FormLabel>Environment Variable Name</FormLabel>
								<FormControl>
									<Input
										{...field}
										placeholder="e.g., BACKEND_URL"
										className="font-mono"
									/>
								</FormControl>
								<div className="text-xs text-muted-foreground">
									This environment variable will be injected into your service
									with the resolved value.
								</div>
								<FormMessage />
							</FormItem>
						)}
					/>

					{selectedService && (
						<div className="p-3 bg-muted/50 rounded-lg space-y-2">
							<div className="text-sm font-medium">Preview</div>
							<div className="text-xs text-muted-foreground">
								The following will be added to your environment:
							</div>
							<code className="block text-xs bg-background p-2 rounded border">
								{form.watch("envVariableName")}=${"{{"}service.{selectedService.appName}.{form.watch("attribute")}{"}}"}
							</code>
						</div>
					)}

					<DialogFooter>
						<Button type="submit" isLoading={isLoading} disabled={!selectedService}>
							Update Service Link
						</Button>
					</DialogFooter>
				</form>
			</Form>
		</>
	);
};
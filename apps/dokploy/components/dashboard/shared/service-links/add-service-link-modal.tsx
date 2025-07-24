import { useState } from "react";
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

const addServiceLinkSchema = z.object({
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

type AddServiceLinkForm = z.infer<typeof addServiceLinkSchema>;

interface Props {
	sourceServiceId: string;
	sourceServiceType: "application" | "compose" | "postgres" | "mysql" | "mariadb" | "mongo" | "redis";
	projectId: string;
	onSuccess: () => void;
}

export const AddServiceLinkModal = ({
	sourceServiceId,
	sourceServiceType,
	projectId,
	onSuccess,
}: Props) => {
	const [selectedService, setSelectedService] = useState<any>(null);

	const { data: project } = api.project.one.useQuery({ projectId });
	const { mutateAsync: createServiceLink, isLoading } =
		api.serviceLinks.create.useMutation();

	const form = useForm<AddServiceLinkForm>({
		resolver: zodResolver(addServiceLinkSchema),
		defaultValues: {
			targetServiceId: "",
			targetServiceType: "application",
			attribute: "fqdn",
			envVariableName: "",
		},
	});

	// Get all services in the project except the current one
	const availableServices = extractServices(project)?.filter(
		(service) => service.id !== sourceServiceId
	) || [];

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
			
			// Auto-generate environment variable name
			const currentAttribute = form.getValues("attribute");
			const envVarName = generateEnvVarName(service.name, currentAttribute);
			form.setValue("envVariableName", envVarName);
		}
	};

	const handleAttributeChange = (attribute: string) => {
		form.setValue("attribute", attribute as any);
		if (selectedService) {
			const envVarName = generateEnvVarName(selectedService.name, attribute);
			form.setValue("envVariableName", envVarName);
		}
	};

	const onSubmit = async (data: AddServiceLinkForm) => {
		try {
			await createServiceLink({
				sourceServiceId,
				sourceServiceType,
				...data,
			});
			toast.success("Service link created successfully");
			onSuccess();
		} catch (error: any) {
			toast.error(error.message || "Failed to create service link");
		}
	};

	return (
		<>
			<DialogHeader>
				<DialogTitle>Add Service Link</DialogTitle>
				<DialogDescription>
					Link this service to another service in your project to automatically
					inject connection details as environment variables.
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
							Create Service Link
						</Button>
					</DialogFooter>
				</form>
			</Form>
		</>
	);
};
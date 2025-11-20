import { zodResolver } from "@hookform/resolvers/zod";
import { CloudIcon, Loader2, PlusIcon, RocketIcon } from "lucide-react";
import { useRouter } from "next/router";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { HetznerIcon } from "@/components/icons/cloud-provider-icons";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import {
	Form,
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { api } from "@/utils/api";
import { CloudProvider } from "@dokploy/server/providers/types-client";

const provisionServerSchema = z.object({
	provider: z.nativeEnum(CloudProvider),
	name: z
		.string()
		.min(1, "Server name is required")
		.max(63, "Server name must be less than 63 characters")
		.regex(
			/^[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]$/,
			"Server name must start and end with alphanumeric characters and contain only letters, numbers, and hyphens",
		),
	location: z.string().min(1, "Location is required"),
	serverType: z.string().min(1, "Server type is required"),
	image: z.string().min(1, "Image is required"),
});

type ProvisionServerInput = z.infer<typeof provisionServerSchema>;

export const ProvisionServerWizard = () => {
	const [isOpen, setIsOpen] = useState(false);
	const [step, setStep] = useState<"provider" | "config">("provider");
	const [selectedProvider, setSelectedProvider] =
		useState<CloudProvider | null>(null);
	const router = useRouter();
	const utils = api.useUtils();

	const { data: credentials } = api.cloudProvider.credentials.list.useQuery();
	const { data: locations, isLoading: locationsLoading } =
		api.cloudProvider.provider.listLocations.useQuery(
			{ provider: selectedProvider! },
			{ enabled: !!selectedProvider },
		);
	const { data: serverTypes, isLoading: serverTypesLoading } =
		api.cloudProvider.provider.listServerTypes.useQuery(
			{ provider: selectedProvider! },
			{ enabled: !!selectedProvider },
		);
	const { data: images, isLoading: imagesLoading } =
		api.cloudProvider.provider.listImages.useQuery(
			{ provider: selectedProvider! },
			{ enabled: !!selectedProvider },
		);

	const { mutateAsync: provisionServer, isLoading: isProvisioning } =
		api.cloudProvider.server.provision.useMutation({
			onSuccess: async () => {
				// Immediately refetch jobs to show the new one
				await utils.cloudProvider.job.list.refetch();
			},
		});

	const form = useForm<ProvisionServerInput>({
		defaultValues: {
			provider: CloudProvider.HETZNER,
			name: "",
			location: "",
			serverType: "",
			image: "",
		},
		resolver: zodResolver(provisionServerSchema),
	});

	const hasHetznerCredentials = credentials?.some(
		(c) => c.provider === CloudProvider.HETZNER && c.isValid === "valid",
	);

	const onSubmit = async (data: ProvisionServerInput) => {
		await provisionServer(data)
			.then(async (result) => {
				toast.success(
					`Server provisioning started! Job ID: ${result.jobId.slice(0, 8)}`,
					{
						duration: 5000,
					},
				);

				// Close dialog and reset form first for better UX
				setIsOpen(false);
				form.reset();
				setStep("provider");
				setSelectedProvider(null);

				// Force immediate refetch of job list (will be called again by onSuccess)
				await utils.cloudProvider.job.list.refetch();
				await utils.server.all.invalidate();

				// Scroll to jobs section immediately
				setTimeout(() => {
					const jobsSection = document.querySelector(
						"[data-provisioning-jobs]",
					);
					if (jobsSection) {
						jobsSection.scrollIntoView({
							behavior: "smooth",
							block: "start",
						});
					}
				}, 100);
			})
			.catch((error) => {
				toast.error(error?.message || "Error starting server provisioning");
			});
	};

	const handleProviderSelect = (provider: CloudProvider) => {
		setSelectedProvider(provider);
		form.setValue("provider", provider);
		setStep("config");
	};

	const handleBack = () => {
		setStep("provider");
		form.reset();
	};

	const handleClose = () => {
		setIsOpen(false);
		setStep("provider");
		setSelectedProvider(null);
		form.reset();
	};

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				<Button className="cursor-pointer space-x-3" variant="default">
					<RocketIcon className="h-4 w-4" />
					<span>Provision Server</span>
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<CloudIcon className="size-5" />
						Provision New Server
					</DialogTitle>
					<DialogDescription>
						{step === "provider"
							? "Select a cloud provider to provision a new server"
							: "Configure your new server"}
					</DialogDescription>
				</DialogHeader>

				{step === "provider" ? (
					<div className="space-y-4">
						{!hasHetznerCredentials && (
							<div className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">
								No cloud provider credentials configured. Please add your
								provider credentials in{" "}
								<a
									href="/dashboard/settings/cloud-providers"
									className="text-primary hover:underline"
									onClick={() => setIsOpen(false)}
								>
									Cloud Providers settings
								</a>{" "}
								first.
							</div>
						)}

						<div className="space-y-2">
							<Label>Select Cloud Provider</Label>
							<div className="grid gap-4">
								<Button
									variant="outline"
									className="h-auto flex-col gap-2 p-6"
									onClick={() => handleProviderSelect(CloudProvider.HETZNER)}
									disabled={!hasHetznerCredentials}
								>
									<HetznerIcon className="size-8" />
									<div className="flex flex-col items-center gap-1">
										<span className="font-semibold">Hetzner Cloud</span>
										<span className="text-xs text-muted-foreground">
											Fast servers in Europe & US
										</span>
									</div>
								</Button>
							</div>
						</div>
					</div>
				) : (
					<Form {...form}>
						<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
							<FormField
								control={form.control}
								name="name"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Server Name</FormLabel>
										<FormControl>
											<Input placeholder="my-app-server" {...field} />
										</FormControl>
										<FormDescription>
											A unique name for your server (lowercase letters, numbers,
											and hyphens only)
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>

							<FormField
								control={form.control}
								name="location"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Location</FormLabel>
										<Select
											onValueChange={field.onChange}
											defaultValue={field.value}
											disabled={locationsLoading}
										>
											<FormControl>
												<SelectTrigger>
													<SelectValue placeholder="Select a location" />
												</SelectTrigger>
											</FormControl>
											<SelectContent>
												{locationsLoading ? (
													<div className="flex items-center justify-center p-4">
														<Loader2 className="size-4 animate-spin" />
													</div>
												) : (
													locations?.map((location) => (
														<SelectItem key={location.id} value={location.id}>
															{location.city}, {location.country} -{" "}
															{location.name}
														</SelectItem>
													))
												)}
											</SelectContent>
										</Select>
										<FormDescription>
											Select the datacenter location for your server
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>

							<FormField
								control={form.control}
								name="serverType"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Server Type</FormLabel>
										<Select
											onValueChange={field.onChange}
											defaultValue={field.value}
											disabled={serverTypesLoading}
										>
											<FormControl>
												<SelectTrigger>
													<SelectValue placeholder="Select server type" />
												</SelectTrigger>
											</FormControl>
											<SelectContent>
												{serverTypesLoading ? (
													<div className="flex items-center justify-center p-4">
														<Loader2 className="size-4 animate-spin" />
													</div>
												) : (
													serverTypes?.map((type) => (
														<SelectItem key={type.id} value={type.id}>
															{type.name} - {type.cores} vCPU, {type.memory}
															GB RAM, {type.disk}GB SSD (€
															{type.priceMonthly.toFixed(2)}/mo)
														</SelectItem>
													))
												)}
											</SelectContent>
										</Select>
										<FormDescription>
											Choose your server size and specifications
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>

							<FormField
								control={form.control}
								name="image"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Operating System</FormLabel>
										<Select
											onValueChange={field.onChange}
											defaultValue={field.value}
											disabled={imagesLoading}
										>
											<FormControl>
												<SelectTrigger>
													<SelectValue placeholder="Select OS image" />
												</SelectTrigger>
											</FormControl>
											<SelectContent>
												{imagesLoading ? (
													<div className="flex items-center justify-center p-4">
														<Loader2 className="size-4 animate-spin" />
													</div>
												) : (
													images?.map((image) => (
														<SelectItem key={image.id} value={image.id}>
															{image.name} ({image.osType}{" "}
															{image.osVersion && `- ${image.osVersion}`})
														</SelectItem>
													))
												)}
											</SelectContent>
										</Select>
										<FormDescription>
											Select the operating system for your server
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>

							<div className="flex gap-2 justify-end pt-4">
								<Button type="button" variant="outline" onClick={handleBack}>
									Back
								</Button>
								<Button type="button" variant="secondary" onClick={handleClose}>
									Cancel
								</Button>
								<Button type="submit" isLoading={isProvisioning}>
									<RocketIcon className="mr-2 size-4" />
									Provision Server
								</Button>
							</div>
						</form>
					</Form>
				)}
			</DialogContent>
		</Dialog>
	);
};

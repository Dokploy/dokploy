import { zodResolver } from "@hookform/resolvers/zod";
import {
	Cpu,
	EuroIcon,
	HardDrive,
	Loader2,
	MapPin,
	MemoryStick,
	Zap,
} from "lucide-react";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
} from "@/components/ui/form";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { api } from "@/utils/api";

// Function to classify servers by type
function getServerCategory(cpuType: string) {
	if (cpuType === "shared") {
		return {
			category: "Shared CPU",
			icon: Cpu,
			badge: "shared",
			color: "bg-blue-500",
			description: "Perfect for small and medium projects",
		};
	}

	return {
		category: "Dedicated CPU",
		icon: Zap,
		badge: "dedicated",
		color: "bg-purple-500",
		description: "Maximum performance for demanding applications",
	};
}

const formSchema = z.object({
	location: z.string().min(1, "Please select a location"),
	architecture: z.enum(["x86", "arm"], {
		required_error: "Please select an architecture",
	}),
	selectedServerId: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

export const ShowHetznerProviders = () => {
	const { data: serverTypesData, isLoading: isLoadingTypes } =
		api.hetzner.serverTypes.useQuery();
	const { data: locationsData, isLoading: isLoadingLocations } =
		api.hetzner.locations.useQuery();

	const form = useForm<FormValues>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			location: "",
			architecture: "x86",
			selectedServerId: "",
		},
	});

	const selectedLocation = form.watch("location");
	const selectedArchitecture = form.watch("architecture");

	if (isLoadingTypes || isLoadingLocations) {
		return (
			<div className="flex items-center justify-center p-4">
				<Loader2 className="h-6 w-6 animate-spin" />
			</div>
		);
	}

	const locations = locationsData?.locations ?? [];
	const serverTypes = serverTypesData?.server_types ?? [];

	// Filter server types by selected location AND architecture
	const filteredServerTypes = serverTypes.filter(
		(type) =>
			type.prices.some((price) => price.location === selectedLocation) &&
			type.architecture === selectedArchitecture,
	);

	// Group by CPU type (shared/dedicated)
	const sharedServers = filteredServerTypes.filter(
		(type) => type.cpu_type === "shared",
	);
	const dedicatedServers = filteredServerTypes.filter(
		(type) => type.cpu_type === "dedicated",
	);

	const renderServerGrid = (
		servers: typeof serverTypes,
		category: ReturnType<typeof getServerCategory>,
	) => {
		if (!servers.length) return null;
		const IconComponent = category.icon;

		return (
			<div className="space-y-4">
				<div className="flex items-center gap-2">
					<IconComponent className="h-5 w-5" />
					<h3 className="text-lg font-semibold">{category.category}</h3>
					<Badge variant="outline" className={`text-white ${category.color}`}>
						{category.badge}
					</Badge>
					<Badge variant="outline" className="text-xs text-muted-foreground">
						Sorted by price
					</Badge>
				</div>
				<p className="text-sm text-muted-foreground mb-4">
					{category.description}
				</p>
				<FormField
					control={form.control}
					name="selectedServerId"
					render={({ field }) => (
						<FormItem className="space-y-0">
							<FormControl>
								<RadioGroup
									onValueChange={field.onChange}
									value={field.value}
									className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
								>
									{servers.map((server) => (
										<div key={server.id} className="relative">
											<RadioGroupItem
												value={server.id.toString()}
												id={`server-${server.id}`}
												className="absolute right-4 top-4 z-10"
											/>
											<label htmlFor={`server-${server.id}`}>
												<Card
													className={`relative bg-transparent transition-all duration-200 cursor-pointer ${
														field.value === server.id.toString()
															? "border-primary bg-primary/5"
															: "hover:bg-primary/5"
													}`}
												>
													<CardHeader>
														<CardTitle>{server.name}</CardTitle>
														<CardDescription>
															{server.description}
														</CardDescription>
													</CardHeader>
													<CardContent>
														<div className="flex flex-col gap-3">
															<div className="flex items-center gap-2">
																<Cpu className="h-4 w-4 text-blue-500" />
																<div>
																	<strong>Cores:</strong> {server.cores}
																</div>
															</div>
															<div className="flex items-center gap-2">
																<MemoryStick className="h-4 w-4 text-green-500" />
																<div>
																	<strong>Memory:</strong> {server.memory} GB
																</div>
															</div>
															<div className="flex items-center gap-2">
																<HardDrive className="h-4 w-4 text-purple-500" />
																<div>
																	<strong>Disk:</strong> {server.disk} GB
																</div>
															</div>
															{/* Show price for selected location */}
															{server.prices
																.filter((p) => p.location === selectedLocation)
																.map((p) => (
																	<div
																		key={p.location}
																		className="flex items-center gap-2"
																	>
																		<EuroIcon className="h-4 w-4 text-yellow-500" />
																		<div>
																			<strong>Price (monthly):</strong> €
																			{Number.parseFloat(
																				p.price_monthly.net,
																			).toFixed(2)}
																		</div>
																	</div>
																))}
														</div>
													</CardContent>
												</Card>
											</label>
										</div>
									))}
								</RadioGroup>
							</FormControl>
						</FormItem>
					)}
				/>
			</div>
		);
	};

	function onSubmit(values: FormValues) {
		console.log("Form submitted:", values);
		// Here you can handle the form submission with the selected server
	}

	return (
		<Form {...form}>
			<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
				{/* Filters Card */}
				<Card className="bg-transparent">
					<CardHeader>
						<CardTitle className="flex items-center gap-2 text-xl">
							<MapPin className="h-5 w-5" />
							Filters
						</CardTitle>
						<CardDescription>
							Choose a region and architecture to see location-specific pricing
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-6">
						<Form {...form}>
							<div className="space-y-6">
								{/* Region Selector */}
								<FormField
									control={form.control}
									name="location"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Region</FormLabel>
											<Select
												value={field.value}
												onValueChange={field.onChange}
											>
												<SelectTrigger>
													<SelectValue placeholder="Select a region" />
												</SelectTrigger>
												<SelectContent>
													{locations.map((loc) => (
														<SelectItem key={loc.id} value={loc.name}>
															{loc.description}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
										</FormItem>
									)}
								/>

								{/* Architecture Selector */}
								<FormField
									control={form.control}
									name="architecture"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Architecture</FormLabel>
											<FormControl>
												<RadioGroup
													onValueChange={field.onChange}
													defaultValue={field.value}
													className="grid grid-cols-2 gap-4"
												>
													<FormItem className="flex items-center space-x-3 space-y-0">
														<FormControl>
															<RadioGroupItem value="x86" />
														</FormControl>
														<FormLabel className="font-normal">
															x86 (Intel/AMD)
														</FormLabel>
													</FormItem>
													<FormItem className="flex items-center space-x-3 space-y-0">
														<FormControl>
															<RadioGroupItem value="arm" />
														</FormControl>
														<FormLabel className="font-normal">ARM</FormLabel>
													</FormItem>
												</RadioGroup>
											</FormControl>
										</FormItem>
									)}
								/>
							</div>
						</Form>
					</CardContent>
				</Card>

				{/* Architecture Information */}
				<div className="grid md:grid-cols-2 gap-4">
					<div className="p-4 bg-blue-900 rounded-lg border border-blue-600">
						<div className="flex items-start gap-2">
							<Cpu className="h-5 w-5 text-blue-600 mt-0.5" />
							<div className="text-sm text-blue-200">
								<strong>x86 Architecture:</strong> Traditional Intel/AMD
								processors. Most compatible with existing software and
								applications. Best choice for general-purpose workloads.
							</div>
						</div>
					</div>

					<div className="p-4 bg-green-900 rounded-lg border border-green-600">
						<div className="flex items-start gap-2">
							<Cpu className="h-5 w-5 text-green-600 mt-0.5" />
							<div className="text-sm text-green-200">
								<strong>ARM Architecture:</strong> Modern, energy-efficient
								processors. Excellent price-to-performance ratio. Perfect for
								cloud-native and containerized applications.
							</div>
						</div>
					</div>
				</div>

				{/* Server Types Grid */}
				{selectedLocation && (
					<>
						{renderServerGrid(sharedServers, getServerCategory("shared"))}
						{renderServerGrid(dedicatedServers, getServerCategory("dedicated"))}
						{sharedServers.length === 0 && dedicatedServers.length === 0 && (
							<p className="text-center text-muted-foreground py-10">
								No server types available for this region and architecture
								combination. <br />
								Please try a different region or architecture.
							</p>
						)}
					</>
				)}

				{selectedLocation && form.watch("selectedServerId") && (
					<div className="flex justify-end">
						<Button type="submit" className="bg-primary">
							Continue with Selected Server
						</Button>
					</div>
				)}
			</form>
		</Form>
	);
};

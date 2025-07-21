import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
	CardDescription,
} from "@/components/ui/card";
import { api } from "@/utils/api";
import {
	Loader2,
	Cpu,
	HardDrive,
	MemoryStick,
	MapPin,
	Globe,
	Zap,
	Shield,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useState } from "react";

// Function to format prices correctly
function formatPrice(price: string): string {
	return Number.parseFloat(price).toFixed(2);
}

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

export const ShowHetznerProviders = () => {
	const { data: serverTypes, isLoading: isLoadingTypes } =
		api.hetzner.serverTypes.useQuery();

	const { data: locations, isLoading: isLoadingLocations } =
		api.hetzner.locations.useQuery();

	const [selectedLocation, setSelectedLocation] = useState<string>("");
	const [selectedArchitecture, setSelectedArchitecture] =
		useState<string>("x86");

	if (isLoadingTypes || isLoadingLocations) {
		return (
			<div className="flex items-center justify-center p-4">
				<Loader2 className="h-6 w-6 animate-spin" />
			</div>
		);
	}

	// Get selected location info
	const currentLocation = selectedLocation
		? locations?.find((loc) => loc.name === selectedLocation)
		: locations?.[0]; // Default to first location

	// Get available locations from server types
	const availableLocations = Array.from(
		new Set(
			serverTypes?.flatMap((type) => type.prices.map((p) => p.location)) || [],
		),
	);

	// Filter locations that exist in both endpoints
	const validLocations =
		locations?.filter((loc) => availableLocations.includes(loc.name)) || [];

	const activeLocationName = selectedLocation || validLocations[0]?.name || "";

	// Filter by architecture first, then classify and sort by price
	const filteredServerTypes =
		serverTypes?.filter((type) => {
			if (selectedArchitecture === "all") return true;
			return type.architecture === selectedArchitecture;
		}) || [];

	// Classify servers by type and sort by monthly price
	const sharedServers =
		filteredServerTypes
			?.filter((type) => type.cpu_type === "shared")
			.sort((a, b) => {
				const priceA =
					a.prices.find((p) => p.location === activeLocationName)?.price_monthly
						.gross || "0";
				const priceB =
					b.prices.find((p) => p.location === activeLocationName)?.price_monthly
						.gross || "0";
				return Number.parseFloat(priceA) - Number.parseFloat(priceB);
			}) || [];

	const dedicatedServers =
		filteredServerTypes
			?.filter((type) => type.cpu_type === "dedicated")
			.sort((a, b) => {
				const priceA =
					a.prices.find((p) => p.location === activeLocationName)?.price_monthly
						.gross || "0";
				const priceB =
					b.prices.find((p) => p.location === activeLocationName)?.price_monthly
						.gross || "0";
				return Number.parseFloat(priceA) - Number.parseFloat(priceB);
			}) || [];

	const renderServerGrid = (
		servers: typeof serverTypes,
		category: ReturnType<typeof getServerCategory>,
	) => {
		if (!servers?.length) return null;

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

				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
					{servers.map((serverType) => {
						// Find price for selected location
						const locationPrice = serverType.prices.find(
							(p) => p.location === activeLocationName,
						);

						if (!locationPrice) return null;

						return (
							<Card
								key={serverType.id}
								className="border-2 hover:border-blue-300 transition-colors bg-transparent"
							>
								<CardHeader className="pb-3">
									<div className="flex justify-between items-start">
										<CardTitle className="text-lg">{serverType.name}</CardTitle>
										<div className="flex flex-col gap-1">
											<Badge
												variant="outline"
												className={`text-white ${category.color}`}
											>
												{category.badge}
											</Badge>
											<Badge
												variant="outline"
												className={`text-xs ${serverType.architecture === "arm" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"}`}
											>
												{serverType.architecture.toUpperCase()}
											</Badge>
										</div>
									</div>
									<CardDescription className="text-sm">
										{serverType.description}
									</CardDescription>
								</CardHeader>

								<CardContent className="pt-0">
									<div className="space-y-3">
										{/* Specs */}
										<div className="grid grid-cols-3 gap-2 text-sm">
											<div className="flex items-center gap-1">
												<Cpu className="h-4 w-4 text-blue-500" />
												<span>{serverType.cores} CPU</span>
											</div>
											<div className="flex items-center gap-1">
												<MemoryStick className="h-4 w-4 text-green-500" />
												<span>{serverType.memory}GB RAM</span>
											</div>
											<div className="flex items-center gap-1">
												<HardDrive className="h-4 w-4 text-orange-500" />
												<span>{serverType.disk}GB</span>
											</div>
										</div>

										{/* Pricing for selected location */}
										<div className="border-t pt-3">
											<div className="space-y-2">
												<div className="flex justify-between items-center p-2 bg-green-900 rounded border border-green-600">
													<span className="text-sm text-green-400 font-medium">
														Monthly
													</span>
													<div className="text-right">
														<div className="font-bold text-green-400">
															€{formatPrice(locationPrice.price_monthly.gross)}
															/mo
														</div>
													</div>
												</div>
											</div>
										</div>
									</div>
								</CardContent>
							</Card>
						);
					})}
				</div>
			</div>
		);
	};

	return (
		<div className="space-y-6">
			{/* Region and Architecture Selectors */}
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
				<CardContent>
					<div className="space-y-4">
						{/* Region Selector */}
						<div>
							<span className="text-sm font-medium mb-2 block">Region</span>
							<div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
								<div className="flex-1">
									<Select
										value={selectedLocation}
										onValueChange={setSelectedLocation}
									>
										<SelectTrigger className="w-full">
											<SelectValue placeholder="Select a region" />
										</SelectTrigger>
										<SelectContent>
											{validLocations.map((location) => (
												<SelectItem key={location.name} value={location.name}>
													<div className="flex items-center gap-2">
														<span className="font-medium">{location.name}</span>
														<span className="text-sm text-muted-foreground">
															{location.city}, {location.country}
														</span>
													</div>
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>

								{currentLocation && (
									<div className="flex flex-col sm:flex-row gap-2 text-sm text-muted-foreground">
										<Badge
											variant="outline"
											className="flex items-center gap-1"
										>
											<Globe className="h-3 w-3" />
											{currentLocation.description}
										</Badge>
										<Badge variant="outline">
											{currentLocation.network_zone}
										</Badge>
									</div>
								)}
							</div>
						</div>

						{/* Architecture Selector */}
						<div>
							<span className="text-sm font-medium mb-2 block">
								Architecture
							</span>
							<div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
								<div className="flex-1">
									<Select
										value={selectedArchitecture}
										onValueChange={setSelectedArchitecture}
									>
										<SelectTrigger className="w-full">
											<SelectValue placeholder="Select architecture" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="x86">
												<div className="flex items-center gap-2">
													<Cpu className="h-4 w-4 text-blue-500" />
													<span className="font-medium">x86 (Intel/AMD)</span>
													<span className="text-sm text-muted-foreground">
														Most common
													</span>
												</div>
											</SelectItem>
											<SelectItem value="arm">
												<div className="flex items-center gap-2">
													<Cpu className="h-4 w-4 text-green-500" />
													<span className="font-medium">ARM</span>
													<span className="text-sm text-muted-foreground">
														Energy efficient
													</span>
												</div>
											</SelectItem>
										</SelectContent>
									</Select>
								</div>

								<div className="flex gap-2 text-sm">
									<Badge variant="outline" className="flex items-center gap-1">
										<span>
											Architecture:{" "}
											{selectedArchitecture === "all"
												? "All"
												: selectedArchitecture.toUpperCase()}
										</span>
									</Badge>
									{filteredServerTypes && (
										<Badge variant="outline">
											{filteredServerTypes.length} servers
										</Badge>
									)}
								</div>
							</div>
						</div>
					</div>
				</CardContent>
			</Card>

			{/* Header with selected region info */}
			{currentLocation && (
				<Card className="bg-muted/50">
					<CardContent className="pt-6">
						<div className="flex items-center justify-between">
							<div>
								<h2 className="text-lg font-semibold text-primary">
									Servers in {currentLocation.city}, {currentLocation.country}
								</h2>
								<p className="text-sm text-primary">
									{currentLocation.description} • Zone:{" "}
									{currentLocation.network_zone}
								</p>
							</div>
							<Shield className="h-8 w-8 text-primary" />
						</div>
					</CardContent>
				</Card>
			)}

			{/* Shared CPU Servers */}
			{renderServerGrid(sharedServers, getServerCategory("shared"))}

			{/* Dedicated CPU Servers */}
			{renderServerGrid(dedicatedServers, getServerCategory("dedicated"))}

			{(!serverTypes || serverTypes.length === 0) && (
				<div className="text-center py-8 text-muted-foreground">
					Could not load server types. Please verify your Hetzner API key.
				</div>
			)}

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
		</div>
	);
};

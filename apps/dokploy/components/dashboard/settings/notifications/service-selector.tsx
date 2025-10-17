import { ChevronsUpDown } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { api } from "@/utils/api";

interface ServiceConfig {
	serviceId: string;
	serviceType: string;
}

interface Service {
	serviceId: string;
	serviceType: string;
	name: string;
	projectName: string;
	environmentName: string;
}

interface ServiceSelectorProps {
	serviceConfigs: ServiceConfig[];
	onChange: (serviceConfigs: ServiceConfig[]) => void;
}

const SERVICE_TYPE_LABELS: Record<string, string> = {
	application: "Application",
	postgres: "PostgreSQL",
	mysql: "MySQL",
	mariadb: "MariaDB",
	mongo: "MongoDB",
	redis: "Redis",
	compose: "Docker Compose",
};

const SERVICE_TYPE_COLORS: Record<string, string> = {
	application: "bg-blue-100 text-blue-800",
	postgres: "bg-green-100 text-green-800",
	mysql: "bg-orange-100 text-orange-800",
	mariadb: "bg-purple-100 text-purple-800",
	mongo: "bg-yellow-100 text-yellow-800",
	redis: "bg-red-100 text-red-800",
	compose: "bg-gray-100 text-gray-800",
};

export const ServiceSelector = ({
	serviceConfigs,
	onChange,
}: ServiceSelectorProps) => {
	const {
		data: allServices,
		isLoading,
		error,
	} = api.notification.getAllServices.useQuery();
	const [open, setOpen] = useState(false);
	const [searchTerm, setSearchTerm] = useState("");

	const filteredServices = useMemo(() => {
		if (!allServices) return [];
		return allServices.filter(
			(service) =>
				service.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
				service.projectName.toLowerCase().includes(searchTerm.toLowerCase()) ||
				service.environmentName
					.toLowerCase()
					.includes(searchTerm.toLowerCase()) ||
				service.serviceType.toLowerCase().includes(searchTerm.toLowerCase()),
		);
	}, [allServices, searchTerm]);

	const groupedServices = useMemo(() => {
		const grouped: Record<string, Service[]> = {};
		filteredServices.forEach((service) => {
			const key = `${service.projectName} - ${service.environmentName}`;
			if (!grouped[key]) {
				grouped[key] = [];
			}
			grouped[key].push(service);
		});
		return grouped;
	}, [filteredServices]);

	const handleServiceToggle = (service: Service) => {
		const isSelected = serviceConfigs.some(
			(config) =>
				config.serviceId === service.serviceId &&
				config.serviceType === service.serviceType,
		);

		if (isSelected) {
			onChange(
				serviceConfigs.filter(
					(config) =>
						!(
							config.serviceId === service.serviceId &&
							config.serviceType === service.serviceType
						),
				),
			);
		} else {
			onChange([
				...serviceConfigs,
				{
					serviceId: service.serviceId,
					serviceType: service.serviceType,
				},
			]);
		}
	};

	const handleRemoveService = (serviceId: string, serviceType: string) => {
		onChange(
			serviceConfigs.filter(
				(config) =>
					!(
						config.serviceId === serviceId && config.serviceType === serviceType
					),
			),
		);
	};

	const isServiceSelected = (service: Service) => {
		return serviceConfigs.some(
			(config) =>
				config.serviceId === service.serviceId &&
				config.serviceType === service.serviceType,
		);
	};

	if (isLoading) {
		return (
			<div className="space-y-2">
				<Label className="text-sm font-medium">Select Services</Label>
				<div className="flex items-center space-x-2">
					<div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
					<span className="text-sm text-muted-foreground">
						Loading services...
					</span>
				</div>
			</div>
		);
	}

	if (error) {
		return (
			<div className="space-y-2">
				<Label className="text-sm font-medium">Select Services</Label>
				<div className="p-4 border border-destructive/20 rounded-lg bg-destructive/5">
					<div className="text-sm text-destructive font-medium">
						Error loading services
					</div>
					<div className="text-xs text-destructive/80 mt-1">
						Unable to load services. Please try refreshing the page or contact
						support if the issue persists.
					</div>
					<div className="text-xs text-muted-foreground mt-2">
						You can still manually add services by entering their IDs below.
					</div>
				</div>
				{/* Fallback manual service entry */}
				<div className="space-y-3 p-3 border rounded-lg bg-muted/50">
					<div className="text-sm font-medium">Manual Service Entry</div>
					<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
						<div>
							<Label htmlFor="manual-service-id" className="text-xs">
								Service ID
							</Label>
							<Input
								id="manual-service-id"
								placeholder="Enter service ID"
								className="mt-1"
							/>
						</div>
						<div>
							<Label htmlFor="manual-service-type" className="text-xs">
								Service Type
							</Label>
							<select className="mt-1 w-full px-3 py-2 border border-input bg-background rounded-md text-sm">
								<option value="application">Application</option>
								<option value="postgres">PostgreSQL</option>
								<option value="mysql">MySQL</option>
								<option value="mariadb">MariaDB</option>
								<option value="mongo">MongoDB</option>
								<option value="redis">Redis</option>
								<option value="compose">Docker Compose</option>
							</select>
						</div>
					</div>
					<Button
						type="button"
						variant="outline"
						size="sm"
						className="w-full"
						onClick={() => {
							// Add manual service logic here
							console.log("Manual service entry not implemented yet");
						}}
					>
						Add Service Manually
					</Button>
				</div>
			</div>
		);
	}

	return (
		<div className="space-y-4">
			<div>
				<Label className="text-sm font-medium">Select Services</Label>
				<p className="text-xs text-muted-foreground mt-1">
					Choose specific services that should receive notifications. You can
					search by service name, project, or environment.
				</p>
			</div>

			{/* Service Selection Dropdown */}
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger asChild>
					<Button
						variant="outline"
						role="combobox"
						aria-expanded={open}
						className="w-full justify-between"
					>
						{serviceConfigs.length > 0
							? `${serviceConfigs.length} service${serviceConfigs.length === 1 ? "" : "s"} selected`
							: "Select services..."}
						<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
					</Button>
				</PopoverTrigger>
				<PopoverContent
					className="w-[--radix-popover-trigger-width] p-0"
					align="start"
				>
					<Command>
						<CommandInput
							placeholder="Search services..."
							value={searchTerm}
							onValueChange={setSearchTerm}
						/>
						<CommandEmpty>No services found.</CommandEmpty>
						<ScrollArea className="h-[300px]">
							{Object.entries(groupedServices).map(([groupName, services]) => (
								<CommandGroup key={groupName} heading={groupName}>
									{services.map((service) => (
										<CommandItem
											key={`${service.serviceId}-${service.serviceType}`}
											onSelect={() => handleServiceToggle(service)}
											className="flex items-center space-x-2 p-2"
										>
											<Checkbox
												checked={isServiceSelected(service)}
												onChange={() => handleServiceToggle(service)}
												className="mr-2"
											/>
											<div className="flex-1 min-w-0">
												<div className="flex items-center space-x-2">
													<span className="font-medium truncate">
														{service.name}
													</span>
													<Badge
														variant="secondary"
														className={cn(
															"text-xs",
															SERVICE_TYPE_COLORS[service.serviceType] ||
																"bg-gray-100 text-gray-800",
														)}
													>
														{SERVICE_TYPE_LABELS[service.serviceType] ||
															service.serviceType}
													</Badge>
												</div>
											</div>
										</CommandItem>
									))}
								</CommandGroup>
							))}
						</ScrollArea>
					</Command>
				</PopoverContent>
			</Popover>

			{/* Selected Services Display */}
			{serviceConfigs.length > 0 && (
				<div className="space-y-2">
					<Label className="text-sm font-medium">Selected Services</Label>
					<div className="space-y-2 max-h-48 overflow-y-auto">
						{serviceConfigs.map((config) => {
							const service = allServices?.find(
								(s) =>
									s.serviceId === config.serviceId &&
									s.serviceType === config.serviceType,
							);
							return (
								<div
									key={`${config.serviceId}-${config.serviceType}`}
									className="flex items-center justify-between p-3 border rounded-lg bg-muted/50"
								>
									<div className="flex-1 min-w-0">
										<div className="flex items-center space-x-2">
											<span className="font-medium truncate">
												{service?.name || config.serviceId}
											</span>
											<Badge
												variant="secondary"
												className={cn(
													"text-xs",
													SERVICE_TYPE_COLORS[config.serviceType] ||
														"bg-gray-100 text-gray-800",
												)}
											>
												{SERVICE_TYPE_LABELS[config.serviceType] ||
													config.serviceType}
											</Badge>
										</div>
										{service && (
											<div className="text-xs text-muted-foreground mt-1">
												{service.projectName} / {service.environmentName}
											</div>
										)}
									</div>
									<Button
										type="button"
										variant="ghost"
										size="sm"
										onClick={() =>
											handleRemoveService(config.serviceId, config.serviceType)
										}
										className="h-8 w-8 p-0 text-destructive hover:text-destructive"
									>
										<X className="h-4 w-4" />
									</Button>
								</div>
							);
						})}
					</div>
				</div>
			)}

			{serviceConfigs.length === 0 && (
				<div className="text-center py-6 text-sm text-muted-foreground">
					No services selected. Use the dropdown above to select services for
					service-specific notifications.
				</div>
			)}
		</div>
	);
};

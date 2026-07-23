import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { api } from "@/utils/api";

const createNetworkSchema = z.object({
	name: z
		.string()
		.min(1, "Network name is required")
		.refine(
			(name) => /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(name),
			"Network name must start with a letter or number and contain only letters, numbers, underscores, periods, and hyphens",
		),
	driver: z.enum(["bridge", "host", "overlay", "macvlan", "none"]),
	subnet: z.string().optional(),
	gateway: z.string().optional(),
	ipRange: z.string().optional(),
});

type CreateNetworkValues = z.infer<typeof createNetworkSchema>;

interface CreateNetworkDialogProps {
	children: React.ReactNode;
	refetch: () => void;
}

export function CreateNetworkDialog({
	children,
	refetch,
}: CreateNetworkDialogProps) {
	const [isOpen, setIsOpen] = useState(false);

	const form = useForm<CreateNetworkValues>({
		resolver: zodResolver(createNetworkSchema),
		defaultValues: {
			name: "",
			driver: "bridge",
			subnet: "",
			gateway: "",
			ipRange: "",
		},
	});

	const createNetworkMutation = api.network.create.useMutation({
		onSuccess: () => {
			toast.success("Network created successfully");
			setIsOpen(false);
			form.reset();
			refetch();
		},
		onError: (error) => {
			toast.error(error.message || "Failed to create network");
		},
	});

	const onSubmit = (values: CreateNetworkValues) => {
		const options: Record<string, string> = {};

		if (values.subnet) {
			options.subnet = values.subnet;
		}
		if (values.gateway) {
			options.gateway = values.gateway;
		}
		if (values.ipRange) {
			options["ip-range"] = values.ipRange;
		}

		createNetworkMutation.mutate({
			name: values.name,
			driver: values.driver,
			options,
		});
	};

	const isLoading = createNetworkMutation.isPending;

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>{children}</DialogTrigger>
			<DialogContent className="sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>Create network</DialogTitle>
					<DialogDescription>
						Create a new Docker network for container communication.
					</DialogDescription>
				</DialogHeader>
				<Form {...form}>
					<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
						<FormField
							control={form.control}
							name="name"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Network name</FormLabel>
									<FormControl>
										<Input
											placeholder="my-network"
											{...field}
											disabled={isLoading}
										/>
									</FormControl>
									<FormDescription>
										Name must start with a letter or number and contain only
										letters, numbers, underscores, periods, and hyphens
									</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="driver"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Driver</FormLabel>
									<Select
										onValueChange={field.onChange}
										defaultValue={field.value}
										disabled={isLoading}
									>
										<FormControl>
											<SelectTrigger>
												<SelectValue placeholder="Select network driver" />
											</SelectTrigger>
										</FormControl>
										<SelectContent>
											<SelectItem value="bridge">Bridge</SelectItem>
											<SelectItem value="host">Host</SelectItem>
											<SelectItem value="overlay">Overlay</SelectItem>
											<SelectItem value="macvlan">Macvlan</SelectItem>
											<SelectItem value="none">None</SelectItem>
										</SelectContent>
									</Select>
									<FormDescription>
										Network driver determines how containers communicate
									</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="subnet"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Subnet (Optional)</FormLabel>
									<FormControl>
										<Input
											placeholder="172.18.0.0/16"
											{...field}
											disabled={isLoading}
										/>
									</FormControl>
									<FormDescription>
										Subnet in CIDR format (e.g., 172.18.0.0/16)
									</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="gateway"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Gateway (Optional)</FormLabel>
									<FormControl>
										<Input
											placeholder="172.18.0.1"
											{...field}
											disabled={isLoading}
										/>
									</FormControl>
									<FormDescription>
										Gateway IP address for the network
									</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="ipRange"
							render={({ field }) => (
								<FormItem>
									<FormLabel>IP Range (Optional)</FormLabel>
									<FormControl>
										<Input
											placeholder="172.18.1.0/24"
											{...field}
											disabled={isLoading}
										/>
									</FormControl>
									<FormDescription>
										IP range in CIDR format for container allocation
									</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>
						<div className="flex justify-end space-x-2">
							<Button
								type="button"
								variant="outline"
								onClick={() => setIsOpen(false)}
								disabled={isLoading}
							>
								Cancel
							</Button>
							<Button type="submit" disabled={isLoading}>
								{isLoading ? "Creating..." : "Create network"}
							</Button>
						</div>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
}

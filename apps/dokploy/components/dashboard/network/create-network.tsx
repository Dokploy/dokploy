import { zodResolver } from "@hookform/resolvers/zod";
import { Network } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { AlertBlock } from "@/components/shared/alert-block";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/utils/api";

const IPV4_REGEX =
	/^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
const CIDR_REGEX =
	/^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\/(?:[0-9]|[1-2][0-9]|3[0-2])$/;

const CreateNetworkSchema = z.object({
	name: z.string().min(1, {
		message: "Name is required",
	}),
	networkName: z
		.string()
		.min(1, { message: "Network name is required" })
		.max(63, { message: "Network name must be 63 characters or less" })
		.regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/, {
			message:
				"Network name must start with alphanumeric and contain only alphanumeric, underscore, period, or hyphen",
		}),
	description: z.string().optional(),
	driver: z.enum(["bridge", "overlay"]),
	subnet: z
		.string()
		.regex(CIDR_REGEX, "Invalid subnet format (e.g., 172.20.0.0/16)")
		.optional()
		.or(z.literal("")),
	gateway: z
		.string()
		.regex(IPV4_REGEX, "Invalid gateway IP address")
		.optional()
		.or(z.literal("")),
	ipRange: z
		.string()
		.regex(CIDR_REGEX, "Invalid IP range format")
		.optional()
		.or(z.literal("")),
	isDefault: z.boolean().default(false),
	attachable: z.boolean().default(true),
	internal: z.boolean().default(false),
});

type CreateNetwork = z.infer<typeof CreateNetworkSchema>;

interface Props {
	serverId?: string | null;
	projectId?: string | null;
}

export const CreateNetwork = ({ serverId, projectId }: Props) => {
	const [visible, setVisible] = useState(false);
	const utils = api.useUtils();

	const { mutateAsync, isLoading, error, isError } =
		api.network.create.useMutation();

	const form = useForm<CreateNetwork>({
		defaultValues: {
			name: "",
			networkName: "",
			description: "",
			driver: "bridge",
			subnet: "",
			gateway: "",
			ipRange: "",
			isDefault: false,
			attachable: true,
			internal: false,
		},
		resolver: zodResolver(CreateNetworkSchema),
	});

	const onSubmit = async (data: CreateNetwork) => {
		await mutateAsync({
			...data,
			projectId: projectId || undefined,
			serverId: serverId || undefined,
			subnet: data.subnet || undefined,
			gateway: data.gateway || undefined,
			ipRange: data.ipRange || undefined,
		});

		toast.success("Network created successfully");
		await utils.network.all.invalidate();
		form.reset();
		setVisible(false);
	};

	return (
		<Dialog open={visible} onOpenChange={setVisible}>
			<DialogTrigger asChild>
				<Button>
					<Network className="h-4 w-4" />
					Create Network
				</Button>
			</DialogTrigger>
			<DialogContent className="max-h-screen overflow-y-auto sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>Create Custom Network</DialogTitle>
					<DialogDescription>
						Create an isolated Docker network for your services
					</DialogDescription>
				</DialogHeader>

				{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}

				<Form {...form}>
					<form
						onSubmit={form.handleSubmit(onSubmit)}
						className="grid w-full gap-4"
					>
						<div className="grid gap-4">
							<FormField
								control={form.control}
								name="name"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Name</FormLabel>
										<FormControl>
											<Input
												placeholder="Production Network"
												{...field}
												autoComplete="off"
											/>
										</FormControl>
										<FormDescription>
											A friendly name for this network
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>

							<FormField
								control={form.control}
								name="networkName"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Docker Network Name</FormLabel>
										<FormControl>
											<Input
												placeholder="prod-network"
												{...field}
												autoComplete="off"
											/>
										</FormControl>
										<FormDescription>
											The actual Docker network name (lowercase, alphanumeric,
											dashes, dots, underscores)
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>

							<FormField
								control={form.control}
								name="description"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Description</FormLabel>
										<FormControl>
											<Textarea
												placeholder="Network for production services..."
												{...field}
											/>
										</FormControl>
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
										>
											<FormControl>
												<SelectTrigger>
													<SelectValue placeholder="Select a driver" />
												</SelectTrigger>
											</FormControl>
											<SelectContent>
												<SelectItem value="bridge">
													Bridge (Single Host)
												</SelectItem>
												<SelectItem value="overlay">
													Overlay (Swarm Mode)
												</SelectItem>
											</SelectContent>
										</Select>
										<FormDescription>
											Bridge for single-host, Overlay for multi-host (Swarm)
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>

							<div className="grid gap-4 md:grid-cols-2">
								<FormField
									control={form.control}
									name="subnet"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Subnet (Optional)</FormLabel>
											<FormControl>
												<Input
													placeholder="172.28.0.0/16"
													{...field}
													autoComplete="off"
												/>
											</FormControl>
											<FormDescription>CIDR notation</FormDescription>
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
													placeholder="172.28.0.1"
													{...field}
													autoComplete="off"
												/>
											</FormControl>
											<FormDescription>Gateway IP</FormDescription>
											<FormMessage />
										</FormItem>
									)}
								/>
							</div>

							<FormField
								control={form.control}
								name="ipRange"
								render={({ field }) => (
									<FormItem>
										<FormLabel>IP Range (Optional)</FormLabel>
										<FormControl>
											<Input
												placeholder="172.28.5.0/24"
												{...field}
												autoComplete="off"
											/>
										</FormControl>
										<FormDescription>
											Allocate IPs from a sub-range
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>

							<div className="space-y-4 rounded-lg border p-4">
								<h4 className="font-medium">Advanced Options</h4>

								<FormField
									control={form.control}
									name="isDefault"
									render={({ field }) => (
										<FormItem className="flex flex-row items-center justify-between">
											<div className="space-y-0.5">
												<FormLabel>Default Network</FormLabel>
												<FormDescription>
													Auto-assign to new resources in this organization
												</FormDescription>
											</div>
											<FormControl>
												<Switch
													checked={field.value}
													onCheckedChange={field.onChange}
												/>
											</FormControl>
										</FormItem>
									)}
								/>

								<FormField
									control={form.control}
									name="attachable"
									render={({ field }) => (
										<FormItem className="flex flex-row items-center justify-between">
											<div className="space-y-0.5">
												<FormLabel>Attachable</FormLabel>
												<FormDescription>
													Allow containers to attach to this network manually
												</FormDescription>
											</div>
											<FormControl>
												<Switch
													checked={field.value}
													onCheckedChange={field.onChange}
												/>
											</FormControl>
										</FormItem>
									)}
								/>

								<FormField
									control={form.control}
									name="internal"
									render={({ field }) => (
										<FormItem className="flex flex-row items-center justify-between">
											<div className="space-y-0.5">
												<FormLabel>Internal</FormLabel>
												<FormDescription>
													Restrict external access (no internet connectivity)
												</FormDescription>
											</div>
											<FormControl>
												<Switch
													checked={field.value}
													onCheckedChange={field.onChange}
												/>
											</FormControl>
										</FormItem>
									)}
								/>
							</div>
						</div>

						<DialogFooter>
							<Button
								type="button"
								variant="secondary"
								onClick={() => setVisible(false)}
							>
								Cancel
							</Button>
							<Button type="submit" isLoading={isLoading}>
								Create Network
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
};

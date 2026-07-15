"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Network, Plus } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
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
import { api } from "@/utils/api";

const LOCAL_SERVER = "__local__";

const formSchema = z.object({
	name: z
		.string()
		.min(1, "Name is required")
		.regex(
			/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/,
			"Only letters, digits, dot, underscore and dash. Must start with a letter or digit.",
		)
		.refine(
			(n) =>
				![
					"dokploy-network",
					"host",
					"bridge",
					"none",
					"ingress",
					"docker_gwbridge",
				].includes(n),
			{
				message:
					"This name is reserved (dokploy-network, host, bridge, none, ingress, docker_gwbridge).",
			},
		),
	driver: z.enum(["bridge", "overlay", "macvlan", "ipvlan"]),
	serverId: z.string().optional(),
	internal: z.boolean(),
	attachable: z.boolean(),
	enableIPv6: z.boolean(),
	subnet: z.string().optional(),
	gateway: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

const defaultValues: FormValues = {
	name: "",
	// Default to overlay: only overlay networks can be attached to Dokploy's
	// Swarm services. Bridge/macvlan/ipvlan remain selectable for host-level
	// network management but won't appear in resource attachment pickers.
	driver: "overlay",
	serverId: LOCAL_SERVER,
	internal: false,
	attachable: false,
	enableIPv6: false,
	subnet: "",
	gateway: "",
};

export const HandleNetwork = () => {
	const [isOpen, setIsOpen] = useState(false);
	const utils = api.useUtils();
	const { data: servers } = api.server.all.useQuery();
	const { mutateAsync, isPending } = api.network.create.useMutation();

	const form = useForm<FormValues>({
		resolver: zodResolver(formSchema),
		defaultValues,
	});

	const onSubmit = async (data: FormValues) => {
		const serverId =
			data.serverId && data.serverId !== LOCAL_SERVER
				? data.serverId
				: undefined;
		const ipamConfig =
			data.subnet || data.gateway
				? [
						{
							subnet: data.subnet || undefined,
							gateway: data.gateway || undefined,
						},
					]
				: undefined;

		try {
			await mutateAsync({
				name: data.name,
				driver: data.driver,
				serverId,
				internal: data.internal,
				attachable: data.attachable,
				enableIPv6: data.enableIPv6,
				...(ipamConfig
					? { ipam: { driver: "default", config: ipamConfig } }
					: {}),
			});
			await utils.network.all.invalidate();
			toast.success(`Network "${data.name}" created`);
			setIsOpen(false);
			form.reset(defaultValues);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to create network",
			);
		}
	};

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				<Button>
					<Plus className="size-4" />
					Add network
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<Network className="size-5 text-muted-foreground" />
						Add network
					</DialogTitle>
					<DialogDescription>
						Create a new Docker network. You can optionally assign it to a
						remote server and configure a subnet/gateway.
					</DialogDescription>
				</DialogHeader>
				<Form {...form}>
					<form
						onSubmit={form.handleSubmit(onSubmit)}
						className="flex flex-col gap-4"
					>
						<FormField
							control={form.control}
							name="name"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Name</FormLabel>
									<FormControl>
										<Input placeholder="my-network" {...field} />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
							<FormField
								control={form.control}
								name="driver"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Driver</FormLabel>
										<Select onValueChange={field.onChange} value={field.value}>
											<FormControl>
												<SelectTrigger>
													<SelectValue />
												</SelectTrigger>
											</FormControl>
											<SelectContent>
												<SelectItem value="bridge">bridge</SelectItem>
												<SelectItem value="overlay">overlay</SelectItem>
												<SelectItem value="macvlan">macvlan</SelectItem>
												<SelectItem value="ipvlan">ipvlan</SelectItem>
											</SelectContent>
										</Select>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="serverId"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Server</FormLabel>
										<Select
											onValueChange={field.onChange}
											value={field.value ?? LOCAL_SERVER}
										>
											<FormControl>
												<SelectTrigger>
													<SelectValue />
												</SelectTrigger>
											</FormControl>
											<SelectContent>
												<SelectItem value={LOCAL_SERVER}>
													Dokploy host
												</SelectItem>
												{servers?.map((s) => (
													<SelectItem key={s.serverId} value={s.serverId}>
														{s.name}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
										<FormMessage />
									</FormItem>
								)}
							/>
						</div>

						<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
							<FormField
								control={form.control}
								name="subnet"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Subnet (optional)</FormLabel>
										<FormControl>
											<Input placeholder="172.28.0.0/16" {...field} />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="gateway"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Gateway (optional)</FormLabel>
										<FormControl>
											<Input placeholder="172.28.0.1" {...field} />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
						</div>

						<FormField
							control={form.control}
							name="internal"
							render={({ field }) => (
								<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
									<div className="space-y-0.5">
										<FormLabel>Internal</FormLabel>
										<FormDescription>
											Restrict external access to the network.
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
								<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
									<div className="space-y-0.5">
										<FormLabel>Attachable</FormLabel>
										<FormDescription>
											Allow manual container attachment.
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
							name="enableIPv6"
							render={({ field }) => (
								<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
									<div className="space-y-0.5">
										<FormLabel>Enable IPv6</FormLabel>
										<FormDescription>
											Enable IPv6 networking on this network.
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

						<DialogFooter>
							<Button
								type="button"
								variant="outline"
								onClick={() => setIsOpen(false)}
							>
								Cancel
							</Button>
							<Button type="submit" disabled={isPending}>
								{isPending ? "Creating…" : "Create network"}
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
};

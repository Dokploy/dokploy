import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import copy from "copy-to-clipboard";
import { CopyIcon, PlusIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { type Control, useForm, useWatch } from "react-hook-form";
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
import { api } from "@/utils/api";
import { readableErrorMessage } from "@/utils/error-message";

const host = z
	.string()
	.trim()
	.min(1, "Required")
	.regex(/^[A-Za-z0-9.:[\]-]+$/, "Enter an IP address or host name");

const sshAccessSchema = z.object({
	sshAddress: host,
	sshPort: z.number({ error: "Enter a port" }).int().min(1).max(65535),
	sshUser: z
		.string()
		.trim()
		.regex(/^[a-z_][a-z0-9_-]{0,31}$/, "Enter a Linux user name"),
	sshKeyId: z.string().min(1, "Choose an SSH key"),
	endpointAddress: host,
});

const SshAccessFields = ({
	control,
	addressHint,
	endpointHint,
}: {
	control: Control<any>;
	addressHint: string;
	endpointHint: string;
}) => {
	const { data: keys } = api.sshKey.all.useQuery();
	const sshKeyId = useWatch({ control, name: "sshKeyId" });
	const publicKey = keys?.find((key) => key.sshKeyId === sshKeyId)?.publicKey;
	return (
		<>
			<div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_7rem_8rem]">
				<FormField
					control={control}
					name="sshAddress"
					render={({ field }) => (
						<FormItem>
							<FormLabel>SSH address</FormLabel>
							<FormControl>
								<Input placeholder="203.0.113.10" {...field} />
							</FormControl>
							<FormDescription>{addressHint}</FormDescription>
							<FormMessage />
						</FormItem>
					)}
				/>
				<FormField
					control={control}
					name="sshPort"
					render={({ field }) => (
						<FormItem>
							<FormLabel>Port</FormLabel>
							<FormControl>
								<Input
									type="number"
									{...field}
									onChange={(event) =>
										field.onChange(Number(event.target.value))
									}
								/>
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>
				<FormField
					control={control}
					name="sshUser"
					render={({ field }) => (
						<FormItem>
							<FormLabel>User</FormLabel>
							<FormControl>
								<Input {...field} />
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>
			</div>
			<FormField
				control={control}
				name="sshKeyId"
				render={({ field }) => (
					<FormItem>
						<FormLabel>SSH key</FormLabel>
						<Select onValueChange={field.onChange} value={field.value ?? ""}>
							<FormControl>
								<SelectTrigger>
									<SelectValue placeholder="Choose a key from Settings → SSH Keys" />
								</SelectTrigger>
							</FormControl>
							<SelectContent>
								{keys?.map((key) => (
									<SelectItem key={key.sshKeyId} value={key.sshKeyId}>
										{key.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<FormMessage />
					</FormItem>
				)}
			/>
			{publicKey && (
				<div className="flex flex-col gap-1">
					<span className="text-sm text-muted-foreground">
						Add this public key to the user's{" "}
						<code>~/.ssh/authorized_keys</code> on that machine. The user needs
						root or passwordless sudo.
					</span>
					<div className="flex items-start gap-2">
						<code className="max-h-20 flex-1 overflow-auto break-all rounded-md border bg-muted p-2 text-xs">
							{publicKey}
						</code>
						<Button
							type="button"
							variant="outline"
							size="icon"
							aria-label="Copy public key"
							onClick={() => {
								copy(publicKey);
								toast.success("Public key copied");
							}}
						>
							<CopyIcon className="size-4" />
						</Button>
					</div>
				</div>
			)}
			<FormField
				control={control}
				name="endpointAddress"
				render={({ field }) => (
					<FormItem>
						<FormLabel>Public address for WireGuard</FormLabel>
						<FormControl>
							<Input placeholder="203.0.113.10" {...field} />
						</FormControl>
						<FormDescription>{endpointHint}</FormDescription>
						<FormMessage />
					</FormItem>
				)}
			/>
		</>
	);
};

const enableSchema = sshAccessSchema.extend({
	subnet: z
		.string()
		.regex(
			/^(\d{1,3}\.){3}\d{1,3}\/(1[6-9]|2[0-8])$/,
			"Enter an IPv4 subnet from /16 to /28",
		),
	listenPort: z
		.number({ error: "Enter a port" })
		.int()
		.min(1024, "Enter a port from 1024 to 65535")
		.max(65535, "Enter a port from 1024 to 65535"),
});

export const EnableMeshDialog = ({ serverId }: { serverId?: string }) => {
	const [open, setOpen] = useState(false);
	const utils = api.useUtils();
	const { data: defaults } = api.clusterMesh.defaults.useQuery(
		{ serverId },
		{ enabled: open },
	);
	const { mutateAsync, isPending } = api.clusterMesh.enable.useMutation();
	const form = useForm<z.infer<typeof enableSchema>>({
		resolver: zodResolver(enableSchema),
		defaultValues: {
			sshAddress: "",
			sshPort: 22,
			sshUser: "root",
			sshKeyId: "",
			endpointAddress: "",
			subnet: "100.96.0.0/24",
			listenPort: 51820,
		},
	});
	const listenPort = useWatch({ control: form.control, name: "listenPort" });

	useEffect(() => {
		if (!defaults) return;
		form.reset({
			...form.getValues(),
			sshAddress: defaults.sshAddress,
			sshPort: defaults.sshPort,
			sshUser: defaults.sshUser,
			sshKeyId: defaults.sshKeyId ?? "",
			endpointAddress: defaults.endpointAddress,
		});
	}, [defaults, form]);

	const onSubmit = async ({
		subnet,
		listenPort,
		...manager
	}: z.infer<typeof enableSchema>) => {
		await mutateAsync({ serverId, subnet, listenPort, manager })
			.then(() => {
				toast.success("Setting up multi-VM networking");
				setOpen(false);
			})
			.catch((error) =>
				toast.error(readableErrorMessage(error, "Could not start the setup")),
			);
		await utils.clusterMesh.get.invalidate({ serverId });
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button>Set up multi-VM networking</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>Set up multi-VM networking</DialogTitle>
					<DialogDescription>
						Dokploy connects to this swarm's manager over SSH, installs
						WireGuard and opens a private tunnel that other VMs join. The swarm
						and its services are not changed or restarted.
					</DialogDescription>
				</DialogHeader>
				<Form {...form}>
					<form
						onSubmit={form.handleSubmit(onSubmit)}
						className="flex flex-col gap-4"
					>
						<SshAccessFields
							control={form.control}
							addressHint={
								serverId
									? "The server's SSH address."
									: "How Dokploy's container reaches this host; usually the Docker gateway shown."
							}
							endpointHint={`Where other VMs reach this machine over the internet. Allow UDP port ${listenPort} to it.`}
						/>
						<FormField
							control={form.control}
							name="subnet"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Tunnel subnet</FormLabel>
									<FormControl>
										<Input {...field} />
									</FormControl>
									<FormDescription>
										Private addresses for the tunnel. Change it only if it
										clashes with a network the VMs already use.
									</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="listenPort"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Tunnel port</FormLabel>
									<FormControl>
										<Input
											type="number"
											{...field}
											onChange={(event) =>
												field.onChange(Number(event.target.value))
											}
										/>
									</FormControl>
									<FormDescription>
										The UDP port the tunnel uses on every VM. Change it if a
										firewall blocks 51820, such as a host that rejects outgoing
										UDP above 49151. It can't be changed after setup.
									</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>
						<AlertBlock type="info">
							Supported: Ubuntu and Debian with systemd. The manager keeps its
							swarm address; only WireGuard and one route are added.
						</AlertBlock>
						<DialogFooter>
							<Button type="submit" isLoading={isPending}>
								Set up
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
};

const addSchema = sshAccessSchema.extend({
	name: z
		.string()
		.trim()
		.min(1, "Required")
		.max(63)
		.regex(/^[A-Za-z0-9][A-Za-z0-9-]*$/, "Use letters, digits and dashes"),
});

export const AddVmDialog = ({
	meshId,
	serverId,
	listenPort,
}: {
	meshId: string;
	serverId?: string;
	listenPort: number;
}) => {
	const [open, setOpen] = useState(false);
	const utils = api.useUtils();
	const { mutateAsync, isPending } = api.clusterMesh.addNode.useMutation();
	const form = useForm<z.infer<typeof addSchema>>({
		resolver: zodResolver(addSchema),
		defaultValues: {
			name: "",
			sshAddress: "",
			sshPort: 22,
			sshUser: "root",
			sshKeyId: "",
			endpointAddress: "",
		},
	});
	const sshAddress = useWatch({ control: form.control, name: "sshAddress" });
	useEffect(() => {
		if (!form.getFieldState("endpointAddress").isDirty) {
			form.setValue("endpointAddress", sshAddress);
		}
	}, [sshAddress, form]);

	const onSubmit = async (values: z.infer<typeof addSchema>) => {
		await mutateAsync({ meshId, ...values })
			.then(() => {
				toast.success(`Adding ${values.name}`);
				form.reset();
				setOpen(false);
			})
			.catch((error) =>
				toast.error(readableErrorMessage(error, "Could not add the VM")),
			);
		await utils.clusterMesh.get.invalidate({ serverId });
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button>
					<PlusIcon className="size-4" />
					Add VM
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>Add a VM</DialogTitle>
					<DialogDescription>
						Dokploy installs Docker and WireGuard on the VM if needed, adds it
						to every node's tunnel and joins it to the swarm as a worker. It
						joins paused: it runs no replicas until you activate it.
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
										<Input placeholder="worker-1" {...field} />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<SshAccessFields
							control={form.control}
							addressHint="The VM's SSH address."
							endpointHint={`Where the other VMs reach it; usually the same public IP. Allow UDP port ${listenPort} to it.`}
						/>
						<AlertBlock type="info">
							The VM must run Ubuntu or Debian with systemd and must not belong
							to another swarm. Setup takes a few minutes; follow it in the VM's
							log.
						</AlertBlock>
						<DialogFooter>
							<Button type="submit" isLoading={isPending}>
								Add VM
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
};

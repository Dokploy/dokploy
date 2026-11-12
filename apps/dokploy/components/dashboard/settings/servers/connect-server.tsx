import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import copy from "copy-to-clipboard";
import { CheckCircle2, CopyIcon, Loader2, Settings } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { AlertBlock } from "@/components/shared/alert-block";
import { Button } from "@/components/ui/button";
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
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/utils/api";

const Schema = z.object({
	name: z.string().trim().min(1, { message: "Name is required" }).max(100),
	description: z.string().max(200).optional(),
	serverType: z.enum(["deploy", "build"]).default("deploy"),
	enableDockerCleanup: z.boolean().default(true),
});

type Schema = z.infer<typeof Schema>;

type PendingCommand = { sshKeyId: string; command: string; expiresAt: number };

const isExpired = (pending: PendingCommand | null) =>
	!!pending && Date.now() > pending.expiresAt * 1000;

// Lives in HandleServers, not in the dialog, so closing the dialog while the
// command runs keeps polling and keeps the command.
export const useConnectServer = () => {
	const utils = api.useUtils();
	const [pending, setPending] = useState<PendingCommand | null>(null);
	const { data: connected } = api.server.connectStatus.useQuery(
		{ sshKeyId: pending?.sshKeyId ?? "" },
		{
			enabled: !!pending,
			refetchInterval: (query) =>
				query.state.data || isExpired(pending) ? false : 3000,
		},
	);

	useEffect(() => {
		if (connected) {
			toast.success("Server connected");
			utils.server.all.invalidate();
			utils.stripe.canCreateMoreServers.invalidate();
			utils.sshKey.all.invalidate();
		}
	}, [connected, utils]);

	return { pending, setPending, connected };
};

interface Props {
	session: ReturnType<typeof useConnectServer>;
	onCompleteSetup: (serverId: string) => void;
	onClose: () => void;
}

export const ConnectServer = ({ session, onCompleteSetup, onClose }: Props) => {
	const { pending, setPending, connected } = session;
	const { data: canCreateMoreServers } =
		api.stripe.canCreateMoreServers.useQuery();
	const { mutateAsync, isPending, error, isError } =
		api.server.generateConnectCommand.useMutation();

	const form = useForm({
		defaultValues: {
			name: "",
			description: "",
			serverType: "deploy",
			enableDockerCleanup: true,
		},
		resolver: zodResolver(Schema),
	});

	const onSubmit = async (data: Schema) => {
		const result = await mutateAsync({
			name: data.name,
			description: data.description || undefined,
			serverType: data.serverType,
			enableDockerCleanup: data.enableDockerCleanup,
		}).catch(() => null);
		if (!result) return;
		setPending({
			sshKeyId: result.sshKeyId,
			expiresAt: result.expiresAt,
			command: `curl -fsSL ${window.location.origin}/api/connect/${result.token} | sudo bash`,
		});
	};

	if (pending && connected) {
		return (
			<div className="flex flex-col gap-4">
				<div className="flex items-start gap-3 rounded-lg border p-4">
					<CheckCircle2 className="mt-0.5 h-5 w-5 text-green-500" />
					<div className="flex flex-col gap-1 text-sm">
						<span className="font-medium">
							{connected.name} is connected ({connected.ipAddress})
						</span>
						<span className="text-muted-foreground">
							Complete the setup to install Docker, Traefik and the rest of the
							server requirements. If the IP address is not right, fix it with
							Edit Server first.
						</span>
					</div>
				</div>
				<div className="flex justify-end gap-2">
					<Button
						type="button"
						variant="outline"
						onClick={() => {
							setPending(null);
							onClose();
						}}
					>
						Close
					</Button>
					<Button
						type="button"
						onClick={() => {
							setPending(null);
							onCompleteSetup(connected.serverId);
						}}
					>
						Complete setup <Settings className="size-4" />
					</Button>
				</div>
			</div>
		);
	}

	if (pending) {
		return (
			<div className="flex flex-col gap-4">
				<div className="flex flex-col gap-2 text-sm">
					<span>
						Run this command on your server as root. It adds Dokploy&apos;s SSH
						key and registers the server. It works once and expires in 1 hour.
					</span>
					<div className="flex items-start justify-between gap-2 rounded-lg bg-muted p-3 font-mono text-xs break-all">
						<span>{pending.command}</span>
						<button
							type="button"
							aria-label="Copy command"
							onClick={() => {
								copy(pending.command);
								toast.success("Copied to clipboard");
							}}
						>
							<CopyIcon className="h-4 w-4 shrink-0 cursor-pointer" />
						</button>
					</div>
				</div>
				{isExpired(pending) ? (
					<AlertBlock type="warning">
						This command expired. Start over to generate a new one.
					</AlertBlock>
				) : (
					<div className="flex items-center gap-3 rounded-lg border p-4 text-sm">
						<Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
						<div className="flex flex-col">
							<span className="font-medium">Waiting for your server…</span>
							<span className="text-muted-foreground">
								This updates by itself when the command runs.
							</span>
						</div>
					</div>
				)}
				<button
					type="button"
					className="self-start text-sm text-muted-foreground underline"
					onClick={() => setPending(null)}
				>
					Start over
				</button>
			</div>
		);
	}

	return (
		<Form {...form}>
			{canCreateMoreServers === false && (
				<AlertBlock type="warning">
					You cannot create more servers,{" "}
					<Link href="/dashboard/settings/billing" className="text-primary">
						Please upgrade your plan
					</Link>
				</AlertBlock>
			)}
			{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}
			<form
				id="hook-form-connect-server"
				onSubmit={form.handleSubmit(onSubmit)}
				className="grid w-full gap-4"
			>
				<FormField
					control={form.control}
					name="name"
					render={({ field }) => (
						<FormItem>
							<FormLabel>Name</FormLabel>
							<FormControl>
								<Input placeholder="Hostinger Server" {...field} />
							</FormControl>
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
									placeholder="This server is for databases..."
									className="resize-none"
									maxLength={200}
									{...field}
								/>
							</FormControl>
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
							<Select onValueChange={field.onChange} defaultValue={field.value}>
								<SelectTrigger>
									<SelectValue placeholder="Select a server type" />
								</SelectTrigger>
								<SelectContent>
									<SelectGroup>
										<SelectItem value="deploy">Deploy Server</SelectItem>
										<SelectItem value="build">Build Server</SelectItem>
									</SelectGroup>
								</SelectContent>
							</Select>
							<FormMessage />
							{field.value === "deploy" ? (
								<AlertBlock type="info" className="mt-2">
									Deploy servers are used to run your applications, databases,
									and services. They handle the deployment and execution of your
									projects.
								</AlertBlock>
							) : (
								<AlertBlock type="info" className="mt-2">
									Build servers are dedicated to building your applications.
									They handle the compilation and build process, offloading this
									work from your deployment servers. Build servers won't appear
									in deployment options.
								</AlertBlock>
							)}
						</FormItem>
					)}
				/>
				<FormField
					control={form.control}
					name="enableDockerCleanup"
					render={({ field }) => (
						<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
							<div className="space-y-0.5">
								<FormLabel>Enable Docker Cleanup</FormLabel>
								<FormDescription>
									Automatically prune unused Docker images daily. Keeps disk
									usage in check on this remote server.
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
				<div className="flex justify-end">
					<Button
						type="submit"
						isLoading={isPending}
						disabled={!canCreateMoreServers}
					>
						Generate command
					</Button>
				</div>
			</form>
		</Form>
	);
};

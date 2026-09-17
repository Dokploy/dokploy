import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import copy from "copy-to-clipboard";
import { CheckCircle2, CopyIcon, Loader2, XCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { AlertBlock } from "@/components/shared/alert-block";
import { Button } from "@/components/ui/button";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { api } from "@/utils/api";
import { displayFont } from "../font";

const schema = z.object({
	name: z.string().min(1, "Name is required"),
	ipAddress: z
		.string()
		.min(1, "IP address is required")
		.refine((value) => !/\s/.test(value), "IP address cannot contain spaces"),
});
type Schema = z.infer<typeof schema>;

interface Props {
	onNext: () => void;
	/** Drops the onboarding wizard's display serif for callers (e.g. the
	 * post-checkout welcome modal) that want the app's regular typography. */
	plainTitle?: boolean;
}

const StatusRow = ({
	label,
	ok,
	pending,
}: {
	label: string;
	ok?: boolean;
	pending?: boolean;
}) => (
	<div className="flex items-center gap-2 text-sm">
		{ok ? (
			<CheckCircle2 className="size-4 text-green-600 dark:text-green-500 shrink-0" />
		) : pending ? (
			<Loader2 className="size-4 text-muted-foreground shrink-0 animate-spin" />
		) : (
			<XCircle className="size-4 text-muted-foreground shrink-0" />
		)}
		<span className={ok ? "" : "text-muted-foreground"}>{label}</span>
	</div>
);

export const ServerStep = ({ onNext, plainTitle }: Props) => {
	const titleClassName = plainTitle
		? "text-xl font-semibold tracking-tight"
		: `${displayFont.className} text-4xl sm:text-5xl leading-[1.05] tracking-tight`;

	const { data: sshKeys, refetch: refetchSSHKeys } = api.sshKey.all.useQuery();
	const generateSSHKey = api.sshKey.generate.useMutation();
	const createSSHKey = api.sshKey.create.useMutation();
	const hasCreatedKey = useRef(false);

	const cloudSSHKey = sshKeys?.find(
		(sshKey) => sshKey.name === "dokploy-onboarding-ssh-key",
	);

	useEffect(() => {
		const ensureKey = async () => {
			if (!sshKeys || cloudSSHKey || hasCreatedKey.current) return;
			hasCreatedKey.current = true;
			try {
				const keys = await generateSSHKey.mutateAsync({ type: "rsa" });
				await createSSHKey.mutateAsync({
					name: "dokploy-onboarding-ssh-key",
					description: "Used during onboarding",
					privateKey: keys.privateKey,
					publicKey: keys.publicKey,
					organizationId: "",
				});
				await refetchSSHKeys();
			} catch {
				hasCreatedKey.current = false;
			}
		};
		ensureKey();
	}, [sshKeys]);

	const { data: existingServers } = api.server.all.useQuery();
	const [createdServerId, setCreatedServerId] = useState<string | null>(null);

	useEffect(() => {
		if (!createdServerId && existingServers && existingServers.length > 0) {
			setCreatedServerId(existingServers[0]!.serverId);
		}
	}, [existingServers, createdServerId]);

	const { data: canCreateMoreServers } =
		api.stripe.canCreateMoreServers.useQuery();
	const { mutateAsync: createServer, isPending: isCreating } =
		api.server.create.useMutation();
	const checkIsReady = (validation?: {
		docker?: { enabled?: boolean };
		isDokployNetworkInstalled?: boolean;
	}) =>
		!!validation?.docker?.enabled && !!validation?.isDokployNetworkInstalled;

	const {
		data: validation,
		refetch: refetchValidation,
		isFetching: isValidating,
	} = api.server.validate.useQuery(
		{ serverId: createdServerId ?? "" },
		{
			enabled: !!createdServerId,
			refetchInterval: (query) =>
				checkIsReady(query.state.data) ? false : 5000,
		},
	);
	const isReady = checkIsReady(validation);

	const [isSettingUp, setIsSettingUp] = useState(false);
	const hasStartedSetup = useRef(false);

	useEffect(() => {
		if (createdServerId && !hasStartedSetup.current && !isReady) {
			hasStartedSetup.current = true;
			setIsSettingUp(true);
		}
	}, [createdServerId, isReady]);

	useEffect(() => {
		if (!isSettingUp) return;
		const timeout = setTimeout(() => {
			setIsSettingUp(false);
			toast.error(
				"Setup is taking too long — check the server is reachable, then try again.",
			);
		}, 120_000);
		return () => clearTimeout(timeout);
	}, [isSettingUp]);

	api.server.setupWithLogs.useSubscription(
		{ serverId: createdServerId ?? "" },
		{
			enabled: !!createdServerId && isSettingUp,
			onData(log) {
				if (typeof log === "string" && log.includes("Setup Server:")) {
					setIsSettingUp(false);
					refetchValidation();
				}
			},
			onError(error) {
				setIsSettingUp(false);
				toast.error("Error setting up the server");
				console.error(error);
			},
		},
	);

	const form = useForm<Schema>({
		defaultValues: { name: "My First Server", ipAddress: "" },
		resolver: zodResolver(schema),
	});

	const onSubmit = async (data: Schema) => {
		if (!cloudSSHKey) {
			toast.error("Still generating your SSH key, try again in a moment");
			return;
		}
		try {
			const server = await createServer({
				name: data.name,
				description: "",
				ipAddress: data.ipAddress.trim(),
				port: 22,
				username: "root",
				sshKeyId: cloudSSHKey.sshKeyId,
				serverType: "deploy",
				enableDockerCleanup: false,
			});
			setCreatedServerId(server.serverId);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Error creating the server",
			);
		}
	};

	return (
		<div className="flex flex-col gap-10">
			<div className="flex flex-col gap-4">
				<span className="font-mono text-xs uppercase tracking-[0.2em] text-primary">
					Infrastructure
				</span>
				<h1 className={titleClassName}>Connect a server.</h1>
				<p className="text-muted-foreground text-lg max-w-md leading-relaxed">
					Dokploy deploys to servers you own — buy one from any VPS provider
					(Hetzner, DigitalOcean, Hostinger...) and paste its IP below.
				</p>
			</div>

			{!createdServerId ? (
				<div className="flex flex-col gap-4 max-w-sm">
					{canCreateMoreServers === false && (
						<AlertBlock type="warning">
							You'll need a plan or trial before connecting a server — go back
							to the "Pick a plan" step.
						</AlertBlock>
					)}
					<div className="flex flex-col gap-2 rounded-lg border p-3">
						<span className="text-xs font-medium text-muted-foreground">
							1. Run this on your server to authorize Dokploy
						</span>
						<div className="flex items-center gap-2">
							<code className="flex-1 min-w-0 truncate rounded bg-muted px-2 py-1.5 text-xs">
								{cloudSSHKey
									? `echo "${cloudSSHKey.publicKey}" >> ~/.ssh/authorized_keys`
									: "Generating..."}
							</code>
							{cloudSSHKey && (
								<button
									type="button"
									onClick={() => {
										copy(
											`echo "${cloudSSHKey.publicKey}" >> ~/.ssh/authorized_keys`,
										);
										toast.success("Copied to clipboard");
									}}
								>
									<CopyIcon className="size-4 text-muted-foreground" />
								</button>
							)}
						</div>
					</div>

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
										<FormLabel>Server name</FormLabel>
										<FormControl>
											<Input placeholder="My First Server" {...field} />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="ipAddress"
								render={({ field }) => (
									<FormItem>
										<FormLabel>2. IP address</FormLabel>
										<FormControl>
											<Input placeholder="192.168.1.100" {...field} />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<Button
								type="submit"
								isLoading={isCreating}
								disabled={!cloudSSHKey || canCreateMoreServers === false}
								className="mt-2"
							>
								Connect server
							</Button>
						</form>
					</Form>
				</div>
			) : (
				<div className="flex flex-col gap-4 w-full max-w-sm">
					<div className="flex flex-col gap-3 rounded-lg border p-4">
						{isSettingUp ? (
							<div className="flex items-center justify-center gap-3 py-4 text-sm text-muted-foreground">
								<Loader2 className="size-4 animate-spin shrink-0" />
								Setting up your server — installing Docker and dependencies...
							</div>
						) : isValidating && !validation ? (
							<div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
								<Loader2 className="size-4 animate-spin" />
								Checking your server...
							</div>
						) : (
							<>
								<StatusRow
									label="Docker installed"
									ok={validation?.docker?.enabled}
									pending={!validation?.docker?.enabled && !isReady}
								/>
								<StatusRow
									label="Dokploy network created"
									ok={validation?.isDokployNetworkInstalled}
									pending={!validation?.isDokployNetworkInstalled && !isReady}
								/>
							</>
						)}
					</div>
					{!isReady && !isSettingUp && (
						<AlertBlock type="info">
							Setup usually takes a minute after the server boots — this checks
							automatically. You can retry setup, or use "Skip for now" above to
							continue and come back to this later.
						</AlertBlock>
					)}
					<div className="flex gap-2">
						<Button
							variant="secondary"
							className="flex-1"
							isLoading={isValidating || isSettingUp}
							onClick={() => {
								if (!isReady && !isSettingUp) {
									setIsSettingUp(true);
								} else {
									refetchValidation();
								}
							}}
						>
							{!isReady && !isSettingUp ? "Retry setup" : "Check now"}
						</Button>
						<Button
							className="flex-1"
							disabled={!isReady || isSettingUp}
							onClick={onNext}
						>
							Continue
						</Button>
					</div>
				</div>
			)}
		</div>
	);
};

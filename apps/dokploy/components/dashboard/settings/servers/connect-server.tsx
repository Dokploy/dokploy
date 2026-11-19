import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import copy from "copy-to-clipboard";
import { CheckCircle2, CopyIcon, Loader2, Settings } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
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
	name: z
		.string()
		.trim()
		.min(1, { message: "settings.servers.connect.errors.nameRequired" })
		.max(100),
	description: z.string().max(200).optional(),
	serverType: z.enum(["deploy", "build"]).default("deploy"),
	enableDockerCleanup: z.boolean().default(true),
	runSetup: z.boolean().default(false),
});

type Schema = z.infer<typeof Schema>;

type PendingCommand = {
	sshKeyId: string;
	command: string;
	expiresAt: number;
	runSetup: boolean;
};

const isExpired = (pending: PendingCommand | null) =>
	!!pending && Date.now() > pending.expiresAt * 1000;

// Lives in HandleServers, not in the dialog, so closing the dialog while the
// command runs keeps polling and keeps the command.
export const useConnectServer = () => {
	const { t } = useTranslation();
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
			toast.success(t("settings.servers.connect.connected"));
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
	const { t } = useTranslation();
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
			runSetup: false,
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
			runSetup: data.runSetup,
			command: data.runSetup
				? `curl -fsSL "${window.location.origin}/api/connect/${result.token}?setup=true" | sudo bash`
				: `curl -fsSL ${window.location.origin}/api/connect/${result.token} | sudo bash`,
		});
	};

	if (pending && connected) {
		return (
			<div className="flex flex-col gap-4">
				<div className="flex items-start gap-3 rounded-lg border p-4">
					<CheckCircle2 className="mt-0.5 h-5 w-5 text-green-500" />
					<div className="flex flex-col gap-1 text-sm">
						<span className="font-medium">
							{t("settings.servers.connect.isConnected", {
								name: connected.name,
								ip: connected.ipAddress,
							})}
						</span>
						<span className="text-muted-foreground">
							{pending.runSetup
								? t("settings.servers.connect.installingRequirements")
								: t("settings.servers.connect.completeSetupHint")}
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
						{t("settings.servers.connect.close")}
					</Button>
					{!pending.runSetup && (
						<Button
							type="button"
							onClick={() => {
								setPending(null);
								onCompleteSetup(connected.serverId);
							}}
						>
							{t("settings.servers.connect.completeSetup")}{" "}
							<Settings className="size-4" />
						</Button>
					)}
				</div>
			</div>
		);
	}

	if (pending) {
		return (
			<div className="flex flex-col gap-4">
				<div className="flex flex-col gap-2 text-sm">
					<span>
						{pending.runSetup
							? t("settings.servers.connect.runCommandWithSetup")
							: t("settings.servers.connect.runCommand")}
					</span>
					<div className="flex items-start justify-between gap-2 rounded-lg bg-muted p-3 font-mono text-xs break-all">
						<span>{pending.command}</span>
						<button
							type="button"
							aria-label={t("settings.servers.connect.copyCommand")}
							onClick={() => {
								copy(pending.command);
								toast.success(t("settings.servers.connect.copiedToClipboard"));
							}}
						>
							<CopyIcon className="h-4 w-4 shrink-0 cursor-pointer" />
						</button>
					</div>
				</div>
				{isExpired(pending) ? (
					<AlertBlock type="warning">
						{t("settings.servers.connect.expired")}
					</AlertBlock>
				) : (
					<div className="flex items-center gap-3 rounded-lg border p-4 text-sm">
						<Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
						<div className="flex flex-col">
							<span className="font-medium">
								{t("settings.servers.connect.waiting")}
							</span>
							<span className="text-muted-foreground">
								{t("settings.servers.connect.waitingHint")}
							</span>
						</div>
					</div>
				)}
				<button
					type="button"
					className="self-start text-sm text-muted-foreground underline"
					onClick={() => setPending(null)}
				>
					{t("settings.servers.connect.startOver")}
				</button>
			</div>
		);
	}

	return (
		<Form {...form}>
			{canCreateMoreServers === false && (
				<AlertBlock type="warning">
					{t("settings.servers.connect.cannotCreateMore")}{" "}
					<Link href="/dashboard/settings/billing" className="text-primary">
						{t("settings.servers.connect.upgradePlan")}
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
							<FormLabel>{t("settings.servers.connect.name")}</FormLabel>
							<FormControl>
								<Input
									placeholder={t("settings.servers.connect.namePlaceholder")}
									{...field}
								/>
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
							<FormLabel>{t("settings.servers.connect.description")}</FormLabel>
							<FormControl>
								<Textarea
									placeholder={t(
										"settings.servers.connect.descriptionPlaceholder",
									)}
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
							<FormLabel>{t("settings.servers.connect.serverType")}</FormLabel>
							<Select onValueChange={field.onChange} defaultValue={field.value}>
								<SelectTrigger>
									<SelectValue
										placeholder={t(
											"settings.servers.connect.serverTypePlaceholder",
										)}
									/>
								</SelectTrigger>
								<SelectContent>
									<SelectGroup>
										<SelectItem value="deploy">
											{t("settings.servers.connect.deployServer")}
										</SelectItem>
										<SelectItem value="build">
											{t("settings.servers.connect.buildServer")}
										</SelectItem>
									</SelectGroup>
								</SelectContent>
							</Select>
							<FormMessage />
							{field.value === "deploy" ? (
								<AlertBlock type="info" className="mt-2">
									{t("settings.servers.connect.deployDescription")}
								</AlertBlock>
							) : (
								<AlertBlock type="info" className="mt-2">
									{t("settings.servers.connect.buildDescription")}
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
								<FormLabel>
									{t("settings.servers.connect.enableDockerCleanup")}
								</FormLabel>
								<FormDescription>
									{t("settings.servers.connect.enableDockerCleanupDescription")}
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
					name="runSetup"
					render={({ field }) => (
						<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
							<div className="space-y-0.5">
								<FormLabel>{t("settings.servers.connect.runSetup")}</FormLabel>
								<FormDescription>
									{t("settings.servers.connect.runSetupDescription")}
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
						{t("settings.servers.connect.generateCommand")}
					</Button>
				</div>
			</form>
		</Form>
	);
};

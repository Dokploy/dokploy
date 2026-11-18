import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { PlusIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
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
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
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
	SelectLabel,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/utils/api";
import { ConnectServer, useConnectServer } from "./connect-server";
import { SetupServer } from "./setup-server";

const Schema = z.object({
	name: z.string().min(1, {
		message: "settings.servers.handle.errors.nameRequired",
	}),
	description: z.string().optional(),
	ipAddress: z.string().min(1, {
		message: "settings.servers.handle.errors.ipAddressRequired",
	}),
	port: z.number().optional(),
	username: z.string().optional(),
	sshKeyId: z.string().min(1, {
		message: "settings.servers.handle.errors.sshKeyRequired",
	}),
	serverType: z.enum(["deploy", "build"]).default("deploy"),
	enableDockerCleanup: z.boolean().default(true),
});

type Schema = z.infer<typeof Schema>;

interface Props {
	serverId?: string;
	children?: React.ReactNode;
}

export const HandleServers = ({ serverId, children }: Props) => {
	const { t } = useTranslation();
	const utils = api.useUtils();
	const [isOpen, setIsOpen] = useState(false);
	const [setupServerId, setSetupServerId] = useState<string | null>(null);
	const connectSession = useConnectServer();
	const { data: canCreateMoreServers, refetch } =
		api.stripe.canCreateMoreServers.useQuery();

	const { data, refetch: refetchServer } = api.server.one.useQuery(
		{
			serverId: serverId || "",
		},
		{
			enabled: !!serverId,
		},
	);

	const { data: sshKeys } = api.sshKey.all.useQuery();
	const { mutateAsync, error, isPending, isError } = serverId
		? api.server.update.useMutation()
		: api.server.create.useMutation();
	const form = useForm({
		defaultValues: {
			description: "",
			name: "",
			ipAddress: "",
			port: 22,
			username: "root",
			sshKeyId: "",
			serverType: "deploy",
			enableDockerCleanup: true,
		},
		resolver: zodResolver(Schema),
	});

	useEffect(() => {
		form.reset({
			description: data?.description || "",
			name: data?.name || "",
			ipAddress: data?.ipAddress || "",
			port: data?.port || 22,
			username: data?.username || "root",
			sshKeyId: data?.sshKeyId || "",
			serverType: data?.serverType || "deploy",
			enableDockerCleanup: data?.enableDockerCleanup ?? true,
		});
	}, [form, form.reset, form.formState.isSubmitSuccessful, data]);

	useEffect(() => {
		refetch();
	}, [isOpen]);

	const onSubmit = async (data: Schema) => {
		await mutateAsync({
			name: data.name,
			description: data.description || "",
			ipAddress: data.ipAddress?.trim() || "",
			port: data.port || 22,
			username: data.username || "root",
			sshKeyId: data.sshKeyId || "",
			serverType: data.serverType || "deploy",
			enableDockerCleanup: data.enableDockerCleanup,
			serverId: serverId || "",
		})
			.then(async (_data) => {
				await utils.server.all.invalidate();
				refetchServer();
				toast.success(
					serverId
						? t("settings.servers.handle.updated")
						: t("settings.servers.handle.created"),
				);
				setIsOpen(false);
			})
			.catch(() => {
				toast.error(
					serverId
						? t("settings.servers.handle.updateError")
						: t("settings.servers.handle.createError"),
				);
			});
	};

	const manualForm = (
		<>
			{!canCreateMoreServers && (
				<AlertBlock type="warning" className="mt-4">
					{t("settings.servers.connect.cannotCreateMore")}{" "}
					<Link href="/dashboard/settings/billing" className="text-primary">
						{t("settings.servers.connect.upgradePlan")}
					</Link>
				</AlertBlock>
			)}
			{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}
			<Form {...form}>
				<form
					id="hook-form-add-server"
					onSubmit={form.handleSubmit(onSubmit)}
					className="grid w-full gap-4"
				>
					<div className="flex flex-col gap-4 ">
						<FormField
							control={form.control}
							name="name"
							render={({ field }) => (
									<FormItem>
										<FormLabel>{t("settings.servers.connect.name")}</FormLabel>
										<FormControl>
											<Input
												placeholder={t(
													"settings.servers.connect.namePlaceholder",
												)}
												{...field}
											/>
										</FormControl>

									<FormMessage />
								</FormItem>
							)}
						/>
					</div>
					<FormField
						control={form.control}
						name="description"
						render={({ field }) => (
								<FormItem>
									<FormLabel>
										{t("settings.servers.connect.description")}
									</FormLabel>
									<FormControl>
										<Textarea
											placeholder={t(
												"settings.servers.connect.descriptionPlaceholder",
											)}
										className="resize-none"
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
						render={({ field }) => {
							const serverTypeValue = form.watch("serverType");
							return (
									<FormItem>
										<FormLabel>
											{t("settings.servers.connect.serverType")}
										</FormLabel>
										<Select
											onValueChange={field.onChange}
											defaultValue={field.value}
										>
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
													<SelectLabel>
														{t("settings.servers.connect.serverType")}
													</SelectLabel>
												</SelectGroup>
											</SelectContent>
										</Select>
										<FormMessage />
										{serverTypeValue === "deploy" && (
											<AlertBlock type="info" className="mt-2">
												{t("settings.servers.connect.deployDescription")}
											</AlertBlock>
										)}
										{serverTypeValue === "build" && (
											<AlertBlock type="info" className="mt-2">
												{t("settings.servers.connect.buildDescription")}
											</AlertBlock>
										)}
								</FormItem>
							);
						}}
					/>
					<FormField
						control={form.control}
						name="sshKeyId"
						render={({ field }) => (
									<FormItem>
										<FormLabel>{t("settings.servers.handle.selectSshKey")}</FormLabel>
										<Select
											onValueChange={field.onChange}
											defaultValue={field.value}
										>
											<SelectTrigger>
												<SelectValue
													placeholder={t("settings.servers.handle.selectSshKey")}
												/>
											</SelectTrigger>
									<SelectContent>
										<SelectGroup>
											{sshKeys?.map((sshKey) => (
												<SelectItem
													key={sshKey.sshKeyId}
													value={sshKey.sshKeyId}
												>
													{sshKey.name}
												</SelectItem>
											))}
											<SelectLabel>
												{t("settings.servers.handle.sshKeysCount", {
													count: sshKeys?.length ?? 0,
												})}
											</SelectLabel>
										</SelectGroup>
									</SelectContent>
								</Select>
								<FormMessage />
							</FormItem>
						)}
					/>
					<div className="grid grid-cols-2 gap-4">
						<FormField
							control={form.control}
							name="ipAddress"
							render={({ field }) => (
									<FormItem>
										<FormLabel>
											{t("settings.servers.handle.ipAddress")}
										</FormLabel>
									<FormControl>
										<Input placeholder="192.168.1.100" {...field} />
									</FormControl>

									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="port"
							render={({ field }) => (
									<FormItem>
										<FormLabel>{t("settings.servers.handle.port")}</FormLabel>
									<FormControl>
										<Input
											placeholder="22"
											{...field}
											onChange={(e) => {
												const value = e.target.value;
												if (value === "") {
													field.onChange(0);
												} else {
													const number = Number.parseInt(value, 10);
													if (!Number.isNaN(number)) {
														field.onChange(number);
													}
												}
											}}
										/>
									</FormControl>

									<FormMessage />
								</FormItem>
							)}
						/>
					</div>

					<FormField
						control={form.control}
						name="username"
						render={({ field }) => (
									<FormItem>
										<FormLabel>{t("settings.servers.handle.username")}</FormLabel>
										<FormControl>
											<Input placeholder="root" {...field} />
										</FormControl>
										<FormDescription>
											{t("settings.servers.handle.usernameHint")}
										</FormDescription>
								<FormMessage />
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
											{t(
												"settings.servers.connect.enableDockerCleanupDescription",
											)}
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
				</form>

				<DialogFooter>
					<Button
						isLoading={isPending}
						disabled={!canCreateMoreServers && !serverId}
						form="hook-form-add-server"
						type="submit"
					>
						{serverId
							? t("settings.servers.handle.update")
							: t("settings.servers.handle.create")}
					</Button>
				</DialogFooter>
			</Form>
		</>
	);

	return (
		<>
			<Dialog open={isOpen} onOpenChange={setIsOpen}>
				{children ? (
					<DialogTrigger asChild>{children}</DialogTrigger>
				) : serverId ? (
					<DialogTrigger asChild>
						<DropdownMenuItem
							className="w-full cursor-pointer "
							onSelect={(e) => {
								e.preventDefault();
							}}
							>
								{t("settings.servers.show.editServer")}
							</DropdownMenuItem>
					</DialogTrigger>
				) : (
					<DialogTrigger asChild>
						<Button className="cursor-pointer space-x-3">
							<PlusIcon className="h-4 w-4" />
							{t("settings.servers.handle.createServer")}
						</Button>
					</DialogTrigger>
				)}
				<DialogContent
					className="sm:max-w-3xl "
					onCloseAutoFocus={(e) => e.preventDefault()}
				>
					<DialogHeader>
						<DialogTitle>
							{serverId
								? t("settings.servers.handle.editTitle")
								: t("settings.servers.handle.createTitle")}
						</DialogTitle>
						<DialogDescription>
							{serverId
								? t("settings.servers.handle.editDescription")
								: t("settings.servers.handle.createDescription")}
						</DialogDescription>
					</DialogHeader>
					<div>
						<p className="text-primary text-sm font-medium">
							{t("settings.servers.handle.providersIntro")}
						</p>
						<ul className="list-inside list-disc pl-4 text-sm text-muted-foreground mt-4">
							<li>
								<a
									href="https://www.hostinger.com/vps-hosting?REFERRALCODE=1SIUMAURICI97"
									className="text-link underline"
								>
									{t("settings.servers.handle.hostingerOffer")}
								</a>
							</li>
							<li>
								<a
									href=" https://app.americancloud.com/register?ref=dokploy"
									className="text-link underline"
								>
									{t("settings.servers.handle.americanCloudOffer")}
								</a>
							</li>
							<li>
								<a
									href="https://m.do.co/c/db24efd43f35"
									className="text-link underline"
								>
									{t("settings.servers.handle.digitalOceanOffer")}
								</a>
							</li>
							<li>
								<a
									href="https://hetzner.cloud/?ref=vou4fhxJ1W2D"
									className="text-link underline"
								>
									{t("settings.servers.handle.hetznerOffer")}
								</a>
							</li>
							<li>
								<a
									href="https://www.vultr.com/?ref=9679828"
									className="text-link underline"
								>
									Vultr
								</a>
							</li>
							<li>
								<a
									href="https://www.linode.com/es/pricing/#compute-shared"
									className="text-link underline"
								>
									Linode
								</a>
							</li>
						</ul>
						<AlertBlock className="mt-4 px-4">
							{t("settings.servers.handle.providersNote")}
						</AlertBlock>
					</div>
					{serverId ? (
						manualForm
					) : (
						<Tabs defaultValue="command">
							<TabsList className="grid w-full grid-cols-2">
								<TabsTrigger value="command">
									{t("settings.servers.handle.runCommandTab")}
								</TabsTrigger>
								<TabsTrigger value="manual">
									{t("settings.servers.handle.manualTab")}
								</TabsTrigger>
							</TabsList>
							<TabsContent
								value="command"
								forceMount
								className="pt-2 data-[state=inactive]:hidden"
							>
								<ConnectServer
									session={connectSession}
									onClose={() => setIsOpen(false)}
									onCompleteSetup={(id) => {
										setIsOpen(false);
										setSetupServerId(id);
									}}
								/>
							</TabsContent>
							<TabsContent value="manual" className="grid gap-4 pt-2">
								{manualForm}
							</TabsContent>
						</Tabs>
					)}
				</DialogContent>
			</Dialog>
			{setupServerId && (
				<SetupServer
					serverId={setupServerId}
					open
					defaultTab="deployments"
					onOpenChange={(open) => {
						if (!open) {
							setSetupServerId(null);
							utils.server.all.invalidate();
						}
					}}
				/>
			)}
		</>
	);
};

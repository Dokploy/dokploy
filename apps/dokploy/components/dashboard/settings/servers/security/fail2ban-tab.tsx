import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
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
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/utils/api";
import { BannedIps } from "./banned-ips";
import { ErrorState, LoadingState, SectionHeader } from "./section-header";

const ipOrCidr = z.union([z.ipv4(), z.ipv6(), z.cidrv4(), z.cidrv6()]);

const Fail2banSchema = z.object({
	permanentBan: z.boolean(),
	bantimeMinutes: z.number().int().min(1).max(525_600),
	findtimeMinutes: z.number().int().min(1).max(1440),
	maxretry: z.number().int().min(1).max(100),
	ignoreip: z.string().refine(
		(value) =>
			value
				.split(/\s+/)
				.filter(Boolean)
				.every((ip) => ipOrCidr.safeParse(ip).success),
		"settings.servers.security.fail2ban.errors.invalidIp",
	),
});

type Fail2banForm = z.infer<typeof Fail2banSchema>;

interface Props {
	serverId: string;
	canEdit: boolean;
}

export const Fail2banTab = ({ serverId, canEdit }: Props) => {
	const { t } = useTranslation();
	const { data, isPending, isError, error, refetch, isRefetching } =
		api.serverSecurity.fail2banStatus.useQuery({ serverId }, { retry: false });
	const configure = api.serverSecurity.configureFail2ban.useMutation();
	const setEnabled = api.serverSecurity.setFail2banEnabled.useMutation();

	const form = useForm<Fail2banForm>({
		resolver: zodResolver(Fail2banSchema),
		defaultValues: {
			permanentBan: false,
			bantimeMinutes: 60,
			findtimeMinutes: 10,
			maxretry: 5,
			ignoreip: "",
		},
	});

	useEffect(() => {
		if (!data) return;
		const bantime = data.config?.bantime ?? 3600;
		const permanentBan = bantime === -1;
		form.reset({
			permanentBan,
			bantimeMinutes: permanentBan ? 60 : Math.round(bantime / 60),
			findtimeMinutes: Math.round((data.config?.findtime ?? 600) / 60),
			maxretry: data.config?.maxretry ?? 5,
			ignoreip: (data.config?.ignoreip ?? [])
				.filter((ip) => !(data.panelIps ?? []).includes(ip))
				.join("\n"),
		});
	}, [data, form]);

	const onSubmit = async (values: Fail2banForm) => {
		try {
			await configure.mutateAsync({
				serverId,
				bantime: values.permanentBan ? -1 : values.bantimeMinutes * 60,
				findtime: values.findtimeMinutes * 60,
				maxretry: values.maxretry,
				ignoreip: values.ignoreip.split(/\s+/).filter(Boolean),
			});
			toast.success(
				data?.installed
					? t("settings.servers.security.fail2ban.updated")
					: t("settings.servers.security.fail2ban.installed"),
			);
			await refetch();
		} catch (err) {
			toast.error(
				(err as Error).message ||
					t("settings.servers.security.fail2ban.configureError"),
			);
		}
	};

	const permanentBan = form.watch("permanentBan");

	if (isPending)
		return (
			<LoadingState label={t("settings.servers.security.fail2ban.checking")} />
		);
	if (isError)
		return (
			<ErrorState
				message={error.message}
				onRetry={() => refetch()}
				isRetrying={isRefetching}
			/>
		);

	return (
		<div className="flex flex-col gap-4">
			<SectionHeader
				title={t("settings.servers.security.fail2ban.title")}
				description={t("settings.servers.security.fail2ban.description")}
				onRefresh={() => refetch()}
				isRefreshing={isRefetching}
			/>
			<div className="flex flex-wrap items-center gap-3 rounded-lg border p-4">
				<div className="flex items-center gap-2 text-sm">
					<span className="text-muted-foreground">
						{t("settings.servers.security.fail2ban.installedLabel")}
					</span>
					<Badge variant={data.installed ? "green" : "red"}>
						{data.installed
							? t("settings.servers.security.fail2ban.yes")
							: t("settings.servers.security.fail2ban.no")}
					</Badge>
				</div>
				<div className="flex items-center gap-2 text-sm">
					<span className="text-muted-foreground">
						{t("settings.servers.security.fail2ban.service")}
					</span>
					<Badge variant={data.active ? "green" : "red"}>
						{data.active
							? t("settings.servers.security.fail2ban.active")
							: t("settings.servers.security.fail2ban.inactive")}
					</Badge>
				</div>
				{data.installed && !data.managedByDokploy && (
					<Badge variant="yellow">
						{t("settings.servers.security.fail2ban.notConfigured")}
					</Badge>
				)}
				{data.installed && (
					<div className="ml-auto flex items-center gap-2">
						<Label htmlFor="fail2ban-enabled">
							{t("settings.servers.security.fail2ban.enabled")}
						</Label>
						<Switch
							id="fail2ban-enabled"
							checked={data.active}
							disabled={!canEdit || setEnabled.isPending}
							onCheckedChange={async (enabled) => {
								try {
									await setEnabled.mutateAsync({ serverId, enabled });
									toast.success(
										enabled
											? t("settings.servers.security.fail2ban.enabledToast")
											: t("settings.servers.security.fail2ban.disabledToast"),
									);
									await refetch();
								} catch (err) {
									toast.error((err as Error).message);
								}
							}}
						/>
					</div>
				)}
			</div>
			<Form {...form}>
				<form
					onSubmit={form.handleSubmit(onSubmit)}
					className="grid gap-4 rounded-lg border p-4"
				>
					<fieldset disabled={!canEdit} className="contents">
						<div className="grid gap-4 md:grid-cols-3">
							<FormField
								control={form.control}
								name="maxretry"
								render={({ field }) => (
									<FormItem>
										<FormLabel>
											{t("settings.servers.security.fail2ban.maxRetries")}
										</FormLabel>
										<FormControl>
											<Input
												type="number"
												min={1}
												{...field}
												onChange={(e) => field.onChange(e.target.valueAsNumber)}
											/>
										</FormControl>
										<FormDescription>
											{t("settings.servers.security.fail2ban.maxRetriesHint")}
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="findtimeMinutes"
								render={({ field }) => (
									<FormItem>
										<FormLabel>
											{t("settings.servers.security.fail2ban.findTime")}
										</FormLabel>
										<FormControl>
											<Input
												type="number"
												min={1}
												{...field}
												onChange={(e) => field.onChange(e.target.valueAsNumber)}
											/>
										</FormControl>
										<FormDescription>
											{t("settings.servers.security.fail2ban.findTimeHint")}
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>
							<div className="space-y-2">
								<FormField
									control={form.control}
									name="permanentBan"
									render={({ field }) => (
										<FormItem>
											<FormLabel>
												{t("settings.servers.security.fail2ban.banDuration")}
											</FormLabel>
											<Select
												value={field.value ? "permanent" : "temporary"}
												onValueChange={(value) =>
													field.onChange(value === "permanent")
												}
											>
												<FormControl>
													<SelectTrigger className="w-full">
														<SelectValue />
													</SelectTrigger>
												</FormControl>
												<SelectContent>
													<SelectItem value="temporary">
														{t("settings.servers.security.fail2ban.temporary")}
													</SelectItem>
													<SelectItem value="permanent">
														{t("settings.servers.security.fail2ban.permanent")}
													</SelectItem>
												</SelectContent>
											</Select>
										</FormItem>
									)}
								/>
								{permanentBan ? (
									<p className="text-sm text-muted-foreground">
										{t("settings.servers.security.fail2ban.permanentHint")}
									</p>
								) : (
									<FormField
										control={form.control}
										name="bantimeMinutes"
										render={({ field }) => (
											<FormItem>
												<FormControl>
													<div className="flex items-center gap-2">
														<Input
															type="number"
															min={1}
															{...field}
															onChange={(e) =>
																field.onChange(e.target.valueAsNumber)
															}
														/>
														<span className="text-sm text-muted-foreground">
															{t("settings.servers.security.fail2ban.minutes")}
														</span>
													</div>
												</FormControl>
												<FormMessage />
											</FormItem>
										)}
									/>
								)}
							</div>
						</div>
						<FormField
							control={form.control}
							name="ignoreip"
							render={({ field }) => (
								<FormItem>
									<FormLabel>
										{t("settings.servers.security.fail2ban.whitelistedIps")}
									</FormLabel>
									<FormControl>
										<Textarea
											placeholder={t(
												"settings.servers.security.fail2ban.whitelistedIpsPlaceholder",
											)}
											className="font-mono text-sm"
											rows={3}
											{...field}
										/>
									</FormControl>
									<FormDescription>
										{t("settings.servers.security.fail2ban.whitelistedIpsHint")}
										{(data.panelIps ?? []).length > 0 && (
											<>
												{" "}
												{t("settings.servers.security.fail2ban.panelIpsHint", {
													ips: (data.panelIps ?? []).join(", "),
												})}
											</>
										)}
									</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>
						<div className="flex justify-end">
							<Button type="submit" isLoading={configure.isPending}>
								{data.installed
									? t("settings.servers.security.fail2ban.saveConfiguration")
									: t("settings.servers.security.fail2ban.installAndEnable")}
							</Button>
						</div>
					</fieldset>
				</form>
			</Form>
			{data.active && (
				<>
					<BannedIps
						serverId={serverId}
						bans={data.bans ?? []}
						panelIps={data.panelIps ?? []}
						canBanManually={(data.jails ?? []).some(
							(jail) => jail.name === "dokploy-manual",
						)}
						canEdit={canEdit}
						onChange={refetch}
					/>
					<div className="rounded-lg border">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>
										{t("settings.servers.security.fail2ban.jail")}
									</TableHead>
									<TableHead>
										{t("settings.servers.security.fail2ban.currentlyFailing")}
									</TableHead>
									<TableHead>
										{t("settings.servers.security.fail2ban.currentlyBanned")}
									</TableHead>
									<TableHead>
										{t("settings.servers.security.fail2ban.totalBanned")}
									</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{(data.jails ?? []).length === 0 ? (
									<TableRow>
										<TableCell
											colSpan={4}
											className="text-center text-muted-foreground"
										>
											{t("settings.servers.security.fail2ban.noJails")}
										</TableCell>
									</TableRow>
								) : (
									(data.jails ?? []).map((jail) => (
										<TableRow key={jail.name}>
											<TableCell className="font-medium">{jail.name}</TableCell>
											<TableCell>{jail.currentlyFailed}</TableCell>
											<TableCell>{jail.currentlyBanned}</TableCell>
											<TableCell>{jail.totalBanned}</TableCell>
										</TableRow>
									))
								)}
							</TableBody>
						</Table>
					</div>
				</>
			)}
		</div>
	);
};

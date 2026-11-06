import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
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
		"Each entry must be a valid IP address or CIDR range",
	),
});

type Fail2banForm = z.infer<typeof Fail2banSchema>;

interface Props {
	serverId: string;
	canEdit: boolean;
}

export const Fail2banTab = ({ serverId, canEdit }: Props) => {
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
				data?.installed ? "Fail2ban updated" : "Fail2ban installed and enabled",
			);
			await refetch();
		} catch (err) {
			toast.error((err as Error).message || "Error configuring Fail2ban");
		}
	};

	const permanentBan = form.watch("permanentBan");

	if (isPending) return <LoadingState label="Checking Fail2ban status..." />;
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
				title="Fail2ban"
				description="Bans IPs that repeatedly fail to authenticate over SSH."
				onRefresh={() => refetch()}
				isRefreshing={isRefetching}
			/>
			<div className="flex flex-wrap items-center gap-3 rounded-lg border p-4">
				<div className="flex items-center gap-2 text-sm">
					<span className="text-muted-foreground">Installed</span>
					<Badge variant={data.installed ? "green" : "red"}>
						{data.installed ? "Yes" : "No"}
					</Badge>
				</div>
				<div className="flex items-center gap-2 text-sm">
					<span className="text-muted-foreground">Service</span>
					<Badge variant={data.active ? "green" : "red"}>
						{data.active ? "Active" : "Inactive"}
					</Badge>
				</div>
				{data.installed && !data.managedByDokploy && (
					<Badge variant="yellow">Not configured by Dokploy</Badge>
				)}
				{data.installed && (
					<div className="ml-auto flex items-center gap-2">
						<Label htmlFor="fail2ban-enabled">Enabled</Label>
						<Switch
							id="fail2ban-enabled"
							checked={data.active}
							disabled={!canEdit || setEnabled.isPending}
							onCheckedChange={async (enabled) => {
								try {
									await setEnabled.mutateAsync({ serverId, enabled });
									toast.success(
										enabled ? "Fail2ban enabled" : "Fail2ban disabled",
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
										<FormLabel>Max retries</FormLabel>
										<FormControl>
											<Input
												type="number"
												min={1}
												{...field}
												onChange={(e) => field.onChange(e.target.valueAsNumber)}
											/>
										</FormControl>
										<FormDescription>Failures before a ban</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="findtimeMinutes"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Find time (minutes)</FormLabel>
										<FormControl>
											<Input
												type="number"
												min={1}
												{...field}
												onChange={(e) => field.onChange(e.target.valueAsNumber)}
											/>
										</FormControl>
										<FormDescription>Window to count failures</FormDescription>
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
											<FormLabel>Ban duration</FormLabel>
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
													<SelectItem value="temporary">Temporary</SelectItem>
													<SelectItem value="permanent">Permanent</SelectItem>
												</SelectContent>
											</Select>
										</FormItem>
									)}
								/>
								{permanentBan ? (
									<p className="text-sm text-muted-foreground">
										Banned IPs stay blocked until you unban them.
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
															minutes
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
									<FormLabel>Whitelisted IPs</FormLabel>
									<FormControl>
										<Textarea
											placeholder="e.g. 203.0.113.10 or 198.51.100.0/24"
											className="font-mono text-sm"
											rows={3}
											{...field}
										/>
									</FormControl>
									<FormDescription>
										One IP or CIDR range per line. These are never banned.
										{(data.panelIps ?? []).length > 0 && (
											<>
												{" "}
												The Dokploy panel ({(data.panelIps ?? []).join(", ")})
												is always whitelisted.
											</>
										)}
									</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>
						<div className="flex justify-end">
							<Button type="submit" isLoading={configure.isPending}>
								{data.installed ? "Save configuration" : "Install & enable"}
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
									<TableHead>Jail</TableHead>
									<TableHead>Currently failing</TableHead>
									<TableHead>Currently banned</TableHead>
									<TableHead>Total banned</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{(data.jails ?? []).length === 0 ? (
									<TableRow>
										<TableCell
											colSpan={4}
											className="text-center text-muted-foreground"
										>
											No active jails
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

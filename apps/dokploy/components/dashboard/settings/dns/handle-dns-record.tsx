import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { PenBoxIcon, PlusIcon } from "lucide-react";
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
import { api } from "@/utils/api";

const DnsRecordSchema = z.object({
	type: z.enum(["A", "CNAME"]),
	name: z.string().min(1, { message: "Name is required" }),
	content: z.string().min(1, { message: "Content is required" }),
	ttl: z.string(),
	proxied: z.boolean(),
});

type DnsRecordForm = z.infer<typeof DnsRecordSchema>;

interface DnsRecordValue {
	id: string;
	type: string;
	name: string;
	content: string;
	ttl: number;
	proxied?: boolean;
}

interface Props {
	dnsProviderId: string;
	zoneId: string;
	zoneName: string;
	providerType: "cloudflare" | "route53";
	record?: DnsRecordValue;
	lastCloudflareProxied?: boolean;
	onCloudflareProxiedSubmit?: (proxied: boolean) => void;
}

export const HandleDnsRecord = ({
	dnsProviderId,
	zoneId,
	zoneName,
	providerType,
	record,
	lastCloudflareProxied,
	onCloudflareProxiedSubmit,
}: Props) => {
	const utils = api.useUtils();
	const [isOpen, setIsOpen] = useState(false);

	const { mutateAsync, isPending, error, isError } = record
		? api.dnsProvider.updateRecord.useMutation()
		: api.dnsProvider.createRecord.useMutation();

	const { data: servers } = api.server.all.useQuery(undefined, {
		enabled: isOpen,
	});
	const { data: panelPublicIp } = api.server.publicIp.useQuery(undefined, {
		enabled: isOpen,
	});
	const { data: panelStoredIp } = api.settings.getIp.useQuery(undefined, {
		enabled: isOpen,
	});

	const panelIp = panelPublicIp || panelStoredIp;
	const ipSuggestions = [
		...(panelIp ? [{ ip: panelIp, label: "This Dokploy server" }] : []),
		...(servers ?? []).map((server) => ({
			ip: server.ipAddress,
			label: server.name,
		})),
	].filter(
		(suggestion, index, all) =>
			!!suggestion.ip && all.findIndex((s) => s.ip === suggestion.ip) === index,
	);

	const defaultProxied =
		providerType === "cloudflare"
			? record
				? record.proxied === true
				: (lastCloudflareProxied ?? true)
			: false;

	const form = useForm<DnsRecordForm>({
		defaultValues: record
			? {
					type: record.type === "CNAME" ? "CNAME" : "A",
					name: record.name,
					content: record.content,
					ttl: record.ttl && record.ttl !== 1 ? String(record.ttl) : "",
					proxied: defaultProxied,
				}
			: {
					type: "A",
					name: "",
					content: "",
					ttl: "",
					proxied: defaultProxied,
				},
		resolver: zodResolver(DnsRecordSchema),
	});

	const type = form.watch("type");
	const proxied = form.watch("proxied");

	const onSubmit = async (data: DnsRecordForm) => {
		const name = data.name.trim() === "@" ? zoneName : data.name;
		const payload = {
			dnsProviderId,
			zoneId,
			type: data.type,
			name,
			content: data.content,
			ttl: data.ttl ? Number(data.ttl) : undefined,
			...(providerType === "cloudflare" && { proxied: data.proxied }),
			...(record && { recordId: record.id }),
		};
		await mutateAsync(payload as any)
			.then(() => {
				toast.success(record ? "Record updated" : "Record created");
				utils.dnsProvider.listRecords.invalidate({ dnsProviderId, zoneId });
				if (providerType === "cloudflare") {
					onCloudflareProxiedSubmit?.(data.proxied);
				}
				setIsOpen(false);
			})
			.catch(() => {});
	};

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				{record ? (
					<Button
						variant="ghost"
						size="icon"
						className="group hover:bg-blue-500/10 size-6"
					>
						<PenBoxIcon className="size-3.5 text-primary group-hover:text-blue-500" />
					</Button>
				) : (
					<Button variant="outline" size="sm">
						<PlusIcon className="size-3.5 mr-1.5" />
						Add Record
					</Button>
				)}
			</DialogTrigger>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>{record ? "Edit Record" : "Add Record"}</DialogTitle>
					<DialogDescription>
						{record
							? "Update this DNS record."
							: "Create a new A or CNAME record in this zone."}
					</DialogDescription>
				</DialogHeader>
				{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}
				<Form {...form}>
					<form
						onSubmit={form.handleSubmit(onSubmit)}
						className="grid w-full gap-4"
					>
						<FormField
							control={form.control}
							name="type"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Type</FormLabel>
									<Select onValueChange={field.onChange} value={field.value}>
										<FormControl>
											<SelectTrigger>
												<SelectValue />
											</SelectTrigger>
										</FormControl>
										<SelectContent>
											<SelectItem value="A">A</SelectItem>
											<SelectItem value="CNAME">CNAME</SelectItem>
										</SelectContent>
									</Select>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="name"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Name</FormLabel>
									<FormControl>
										<Input placeholder="app.example.com" {...field} />
									</FormControl>
									<FormDescription>
										Use <code>@</code> for the root domain.
									</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>
						{type === "A" && ipSuggestions.length > 0 && (
							<FormItem>
								<FormLabel>Fill from server (optional)</FormLabel>
								<Select
									onValueChange={(ip) =>
										form.setValue("content", ip, { shouldValidate: true })
									}
								>
									<FormControl>
										<SelectTrigger>
											<SelectValue placeholder="Select a server" />
										</SelectTrigger>
									</FormControl>
									<SelectContent>
										{ipSuggestions.map((suggestion) => (
											<SelectItem key={suggestion.ip} value={suggestion.ip}>
												<div className="flex flex-row items-center gap-2">
													<span>{suggestion.label}</span>
													<span className="text-xs text-muted-foreground">
														{suggestion.ip}
													</span>
												</div>
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</FormItem>
						)}
						<FormField
							control={form.control}
							name="content"
							render={({ field }) => (
								<FormItem>
									<FormLabel>
										{type === "A" ? "IPv4 Address" : "Target"}
									</FormLabel>
									<FormControl>
										<Input
											placeholder={
												type === "A" ? "203.0.113.10" : "app.example.com"
											}
											{...field}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="ttl"
							render={({ field }) => (
								<FormItem>
									<FormLabel>TTL (optional)</FormLabel>
									<FormControl>
										<Input
											type="number"
											placeholder="Auto"
											disabled={providerType === "cloudflare" && proxied}
											{...field}
										/>
									</FormControl>
									{providerType === "cloudflare" && proxied && (
										<FormDescription>
											Cloudflare uses Auto TTL when Proxy is on.
										</FormDescription>
									)}
									<FormMessage />
								</FormItem>
							)}
						/>
						{providerType === "cloudflare" && (
							<FormField
								control={form.control}
								name="proxied"
								render={({ field }) => (
									<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
										<div className="space-y-0.5">
											<FormLabel>Proxy</FormLabel>
											<FormDescription>
												Orange cloud — traffic goes through Cloudflare. Off is
												DNS only.
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
						)}
						<DialogFooter>
							<Button type="submit" isLoading={isPending}>
								{record ? "Update" : "Create"}
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
};

import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { PenBoxIcon, PlusIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { dnsProviderIcons } from "@/components/icons/dns-provider-icons";
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
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { api } from "@/utils/api";

const providerLabels = {
	cloudflare: "Cloudflare",
	route53: "AWS Route53",
	porkbun: "Porkbun",
} as const;

type ProviderType = keyof typeof providerLabels;

const DnsProviderSchema = z.object({
	name: z
		.string()
		.min(1, { message: "Name is required" })
		.regex(/^[a-zA-Z0-9_-]+$/, {
			message: "Only letters, numbers, dashes and underscores",
		}),
	providerType: z.enum(["cloudflare", "route53", "porkbun"]),
	apiToken: z.string(),
	accessKeyId: z.string(),
	secretAccessKey: z.string(),
	apiKey: z.string(),
	secretApiKey: z.string(),
});

type DnsProviderForm = z.infer<typeof DnsProviderSchema>;

const defaultValues: DnsProviderForm = {
	name: "",
	providerType: "cloudflare",
	apiToken: "",
	accessKeyId: "",
	secretAccessKey: "",
	apiKey: "",
	secretApiKey: "",
};

const buildConfig = (data: DnsProviderForm) => {
	switch (data.providerType) {
		case "cloudflare":
			return {
				providerType: "cloudflare" as const,
				apiToken: data.apiToken,
			};
		case "route53":
			return {
				providerType: "route53" as const,
				accessKeyId: data.accessKeyId,
				secretAccessKey: data.secretAccessKey,
			};
		case "porkbun":
			return {
				providerType: "porkbun" as const,
				apiKey: data.apiKey,
				secretApiKey: data.secretApiKey,
			};
	}
};

const extractErrorMessage = (err: unknown) => {
	if (!(err instanceof Error)) return undefined;
	try {
		const issues = JSON.parse(err.message) as { message?: string }[];
		if (Array.isArray(issues)) {
			return issues
				.map((issue) => issue.message)
				.filter(Boolean)
				.join(", ");
		}
	} catch {}
	return err.message;
};

interface Props {
	dnsProviderId?: string;
}

export const HandleDnsProvider = ({ dnsProviderId }: Props) => {
	const utils = api.useUtils();
	const [isOpen, setIsOpen] = useState(false);

	const { data: provider } = api.dnsProvider.one.useQuery(
		{ dnsProviderId: dnsProviderId || "" },
		{ enabled: !!dnsProviderId && isOpen },
	);

	const { mutateAsync, isPending, error, isError } = dnsProviderId
		? api.dnsProvider.update.useMutation()
		: api.dnsProvider.create.useMutation();

	const { mutateAsync: testConnection, isPending: isTesting } =
		api.dnsProvider.testConnection.useMutation();

	const form = useForm<DnsProviderForm>({
		defaultValues,
		resolver: zodResolver(DnsProviderSchema),
	});

	const providerType = form.watch("providerType");

	useEffect(() => {
		if (provider) {
			form.reset({
				...defaultValues,
				name: provider.name,
				providerType: provider.config.providerType,
				...(provider.config.providerType === "cloudflare" && {
					apiToken: provider.config.apiToken,
				}),
				...(provider.config.providerType === "route53" && {
					accessKeyId: provider.config.accessKeyId,
					secretAccessKey: provider.config.secretAccessKey,
				}),
				...(provider.config.providerType === "porkbun" && {
					apiKey: provider.config.apiKey,
					secretApiKey: provider.config.secretApiKey,
				}),
			});
		} else if (!dnsProviderId) {
			form.reset(defaultValues);
		}
	}, [provider, dnsProviderId, form, isOpen]);

	const onSubmit = async (data: DnsProviderForm) => {
		const payload: any = {
			name: data.name,
			config: buildConfig(data),
			...(dnsProviderId && { dnsProviderId }),
		};
		await mutateAsync(payload)
			.then(() => {
				toast.success(
					dnsProviderId ? "DNS provider updated" : "DNS provider created",
				);
				utils.dnsProvider.all.invalidate();
				setIsOpen(false);
			})
			.catch(() => {});
	};

	const onTestConnection = async () => {
		const isValid = await form.trigger();
		if (!isValid) {
			return;
		}
		const data = form.getValues();
		await testConnection({
			config: buildConfig(data),
			...(dnsProviderId && { dnsProviderId }),
		})
			.then(() => {
				toast.success("Connection successful");
			})
			.catch((err) => {
				toast.error("Connection failed", {
					description: extractErrorMessage(err),
				});
			});
	};

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			{dnsProviderId ? (
				<Tooltip>
					<TooltipTrigger asChild>
						<DialogTrigger asChild>
							<Button
								variant="ghost"
								size="icon"
								className="text-muted-foreground"
							>
								<PenBoxIcon className="size-4" />
								<span className="sr-only">Edit provider</span>
							</Button>
						</DialogTrigger>
					</TooltipTrigger>
					<TooltipContent>Edit provider</TooltipContent>
				</Tooltip>
			) : (
				<DialogTrigger asChild>
					<Button>
						<PlusIcon className="size-4" />
						Add Provider
					</Button>
				</DialogTrigger>
			)}
			<DialogContent className="max-h-screen overflow-y-auto sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>
						{dnsProviderId ? "Update DNS Provider" : "Add DNS Provider"}
					</DialogTitle>
					<DialogDescription>
						Connect a DNS provider to create records for your domains
						automatically instead of setting them up by hand.
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
							name="name"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Name</FormLabel>
									<FormControl>
										<Input placeholder="prod-cloudflare" {...field} />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="providerType"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Provider</FormLabel>
									<Select
										onValueChange={field.onChange}
										value={field.value}
										disabled={!!dnsProviderId}
									>
										<FormControl>
											<SelectTrigger>
												<SelectValue placeholder="Select a provider" />
											</SelectTrigger>
										</FormControl>
										<SelectContent>
											{Object.entries(providerLabels).map(([value, label]) => {
												const ProviderIcon =
													dnsProviderIcons[value as ProviderType];
												return (
													<SelectItem key={value} value={value}>
														<div className="flex flex-row items-center gap-2">
															<ProviderIcon className="size-4 shrink-0" />
															{label}
														</div>
													</SelectItem>
												);
											})}
										</SelectContent>
									</Select>
									<FormMessage />
								</FormItem>
							)}
						/>

						{providerType === "cloudflare" && (
							<FormField
								control={form.control}
								name="apiToken"
								render={({ field }) => (
									<FormItem>
										<FormLabel>API Token</FormLabel>
										<FormControl>
											<Input type="password" {...field} />
										</FormControl>
										<FormDescription>
											Create a token scoped to Zone → DNS → Edit for the zones
											you want Dokploy to manage. Avoid the Global API Key.
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>
						)}

						{providerType === "route53" && (
							<>
								<FormField
									control={form.control}
									name="accessKeyId"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Access Key ID</FormLabel>
											<FormControl>
												<Input {...field} />
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="secretAccessKey"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Secret Access Key</FormLabel>
											<FormControl>
												<Input type="password" {...field} />
											</FormControl>
											<FormDescription>
												Use an IAM user/role scoped to{" "}
												<code>route53:ListHostedZones</code>,{" "}
												<code>route53:ListResourceRecordSets</code> and{" "}
												<code>route53:ChangeResourceRecordSets</code> — avoid
												root account credentials.
											</FormDescription>
											<FormMessage />
										</FormItem>
									)}
								/>
							</>
						)}

						{providerType === "porkbun" && (
							<>
								<FormField
									control={form.control}
									name="apiKey"
									render={({ field }) => (
										<FormItem>
											<FormLabel>API Key</FormLabel>
											<FormControl>
												<Input {...field} />
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="secretApiKey"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Secret API Key</FormLabel>
											<FormControl>
												<Input type="password" {...field} />
											</FormControl>
											<FormDescription>
												Create API keys at porkbun.com/account/api and make sure
												API access is enabled for the domains you want Dokploy
												to manage.
											</FormDescription>
											<FormMessage />
										</FormItem>
									)}
								/>
							</>
						)}

						<DialogFooter className="flex w-full flex-row justify-between gap-2 sm:justify-between">
							<Button
								type="button"
								variant="secondary"
								isLoading={isTesting}
								onClick={onTestConnection}
							>
								Test Connection
							</Button>
							<Button type="submit" isLoading={isPending}>
								{dnsProviderId ? "Update" : "Create"}
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
};

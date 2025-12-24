import { zodResolver } from "@hookform/resolvers/zod";
import { HelpCircle, PlusIcon } from "lucide-react";
import { useEffect, useState } from "react";
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
import { Input, NumberInput } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { api } from "@/utils/api";
import { CertificateSelector } from "./certificate-selector";
import { TargetSelector } from "./target-selector";
import { WildcardIndicator } from "./wildcard-indicator";

const proxySchema = z
	.object({
		name: z.string().min(1, "Name is required"),
		host: z.string().min(1, "Host is required"),
		path: z.string().optional(),
		targetType: z.enum(["url", "application", "compose", "service"]),
		targetUrl: z.string().url().optional(),
		targetId: z.string().optional(),
		port: z.number().min(1).max(65535).optional(),
		https: z.boolean().optional(),
		certificateId: z.string().optional(),
		certificateType: z.enum(["letsencrypt", "none", "custom"]).optional(),
		customCertResolver: z.string().optional(),
		serverId: z.string().optional(),
		stripPath: z.boolean().optional(),
		internalPath: z.string().optional(),
		priority: z.number().optional(),
	})
	.superRefine((input, ctx) => {
		if (input.https && !input.certificateType) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["certificateType"],
				message: "Certificate type is required when HTTPS is enabled",
			});
		}

		if (input.certificateType === "custom" && !input.customCertResolver) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["customCertResolver"],
				message: "Custom certificate resolver is required",
			});
		}

		if (input.targetType === "url" && !input.targetUrl) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["targetUrl"],
				message: "Target URL is required when target type is URL",
			});
		}

		if (input.targetType !== "url" && !input.targetId) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["targetId"],
				message: "Target ID is required when linking to service",
			});
		}

		if (input.stripPath && (!input.path || input.path === "/")) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["stripPath"],
				message:
					"Strip path can only be enabled when a path other than '/' is specified",
			});
		}

		if (
			input.internalPath &&
			input.internalPath !== "/" &&
			!input.internalPath.startsWith("/")
		) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["internalPath"],
				message: "Internal path must start with '/'",
			});
		}
	});

type ProxyForm = z.infer<typeof proxySchema>;

interface Props {
	proxyId?: string;
	children?: React.ReactNode;
}

export const AddProxy = ({ proxyId, children }: Props) => {
	const [open, setOpen] = useState(false);
	const utils = api.useUtils();

	const { data: proxy } = api.proxy.one.useQuery(
		{ proxyId: proxyId! },
		{ enabled: !!proxyId },
	);

	const { data: isCloud } = api.settings.isCloud.useQuery();
	const { data: servers } = api.server.withSSHKey.useQuery();
	const hasServers = servers && servers.length > 0;
	const shouldShowServerDropdown = hasServers;

	const { mutateAsync, isError, error, isLoading } = proxyId
		? api.proxy.update.useMutation()
		: api.proxy.create.useMutation();

	const form = useForm<ProxyForm>({
		resolver: zodResolver(proxySchema),
		defaultValues: {
			name: "",
			host: "",
			path: "/",
			targetType: "url",
			targetUrl: "",
			targetId: undefined,
			port: 3000,
			https: false,
			certificateType: "none",
			customCertResolver: undefined,
			serverId: undefined,
			stripPath: false,
			internalPath: "/",
			priority: 0,
		},
	});

	const targetType = form.watch("targetType");
	const https = form.watch("https");
	const certificateType = form.watch("certificateType");
	const host = form.watch("host");
	const isWildcard = host?.startsWith("*.") || false;

	useEffect(() => {
		if (proxy) {
			form.reset({
				name: proxy.name,
				host: proxy.host,
				path: proxy.path || "/",
				targetType: proxy.targetType,
				targetUrl: proxy.targetUrl || "",
				targetId: proxy.targetId || undefined,
				port: proxy.port || 3000,
				https: proxy.https || false,
				certificateId: proxy.certificateId || undefined,
				certificateType: proxy.certificateType,
				customCertResolver: proxy.customCertResolver || undefined,
				serverId: proxy.serverId || undefined,
				stripPath: proxy.stripPath || false,
				internalPath: proxy.internalPath || "/",
				priority: proxy.priority || 0,
			});
		}
	}, [form, proxy]);

	const onSubmit = async (data: ProxyForm) => {
		await mutateAsync({
			...(proxyId && { proxyId }),
			...data,
		})
			.then(async () => {
				toast.success(proxyId ? "Proxy Updated" : "Proxy Created");
				await utils.proxy.all.invalidate();
				setOpen(false);
			})
			.catch(() => {
				toast.error(
					proxyId ? "Error updating the proxy" : "Error creating the proxy",
				);
			});
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger className="" asChild>
				{children || (
					<Button>
						<PlusIcon className="h-4 w-4" />
						Add Proxy
					</Button>
				)}
			</DialogTrigger>
			<DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle>
						{proxyId ? "Edit Proxy" : "Add New Proxy"}
					</DialogTitle>
					<DialogDescription>
						Configure a reverse proxy to route traffic to your services
					</DialogDescription>
				</DialogHeader>
				{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}

				<Form {...form}>
					<form
						id="hook-form-add-proxy"
						onSubmit={form.handleSubmit(onSubmit)}
						className="grid w-full gap-4"
					>
						<FormField
							control={form.control}
							name="name"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Proxy Name</FormLabel>
									<FormControl>
										<Input placeholder="My Proxy" {...field} />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name="host"
							render={({ field }) => (
								<FormItem>
									<FormLabel className="flex items-center gap-2">
										Host / Domain
										{isWildcard && <WildcardIndicator />}
									</FormLabel>
									<FormControl>
										<Input
											placeholder="example.com or *.example.com"
											{...field}
										/>
									</FormControl>
									<FormDescription>
										Enter a domain name or wildcard pattern (e.g., *.example.com)
									</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name="path"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Path Prefix (Optional)</FormLabel>
									<FormControl>
										<Input placeholder="/" {...field} value={field.value || "/"} />
									</FormControl>
									<FormDescription>
										Path prefix to match (e.g., /api)
									</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>

						<TargetSelector form={form} />

						<FormField
							control={form.control}
							name="port"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Target Port</FormLabel>
									<FormControl>
										<NumberInput
											placeholder="3000"
											{...field}
											value={field.value}
											onChange={(e) => field.onChange(Number.parseInt(e.target.value, 10))}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name="https"
							render={({ field }) => (
								<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
									<div className="space-y-0.5">
										<FormLabel>Enable HTTPS</FormLabel>
										<FormDescription>
											Enable HTTPS for this proxy
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

						{https && (
							<>
								<CertificateSelector form={form} host={host} />
								<FormField
									control={form.control}
									name="certificateType"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Certificate Type</FormLabel>
											<Select
												onValueChange={field.onChange}
												defaultValue={field.value}
											>
												<FormControl>
													<SelectTrigger>
														<SelectValue placeholder="Select certificate type" />
													</SelectTrigger>
												</FormControl>
												<SelectContent>
													<SelectItem value="letsencrypt">
														Let's Encrypt
													</SelectItem>
													<SelectItem value="custom">Custom Resolver</SelectItem>
													<SelectItem value="none">None</SelectItem>
												</SelectContent>
											</Select>
											<FormMessage />
										</FormItem>
									)}
								/>

								{certificateType === "custom" && (
									<FormField
										control={form.control}
										name="customCertResolver"
										render={({ field }) => (
											<FormItem>
												<FormLabel>Custom Certificate Resolver</FormLabel>
												<FormControl>
													<Input placeholder="my-resolver" {...field} />
												</FormControl>
												<FormMessage />
											</FormItem>
										)}
									/>
								)}
							</>
						)}

						{shouldShowServerDropdown && (
							<FormField
								control={form.control}
								name="serverId"
								render={({ field }) => (
									<FormItem>
										<TooltipProvider delayDuration={0}>
											<Tooltip>
												<TooltipTrigger asChild>
													<FormLabel className="break-all w-fit flex flex-row gap-1 items-center">
														Select a Server {!isCloud && "(Optional)"}
														<HelpCircle className="size-4 text-muted-foreground" />
													</FormLabel>
												</TooltipTrigger>
												<TooltipContent>
													Select the server where this proxy should be configured
												</TooltipContent>
											</Tooltip>
										</TooltipProvider>
										<Select
											onValueChange={field.onChange}
											defaultValue={
												field.value || (!isCloud ? undefined : undefined)
											}
										>
											<FormControl>
												<SelectTrigger>
													<SelectValue placeholder="Select a Server" />
												</SelectTrigger>
											</FormControl>
											<SelectContent>
												{!isCloud && (
													<SelectItem value={undefined}>
														<span className="flex items-center gap-2 justify-between w-full">
															<span>Dokploy</span>
															<span className="text-muted-foreground text-xs self-center">
																Default
															</span>
														</span>
													</SelectItem>
												)}
												{servers?.map((server) => (
													<SelectItem key={server.serverId} value={server.serverId}>
														<span className="flex items-center gap-2 justify-between w-full">
															<span>{server.name}</span>
															<span className="text-muted-foreground text-xs self-center">
																{server.ipAddress}
															</span>
														</span>
													</SelectItem>
												))}
											</SelectContent>
										</Select>
										<FormMessage />
									</FormItem>
								)}
							/>
						)}

						<FormField
							control={form.control}
							name="stripPath"
							render={({ field }) => (
								<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
									<div className="space-y-0.5">
										<FormLabel>Strip Path</FormLabel>
										<FormDescription>
											Remove the path prefix before forwarding to target
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
							name="internalPath"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Internal Path (Optional)</FormLabel>
									<FormControl>
										<Input placeholder="/" {...field} value={field.value || "/"} />
									</FormControl>
									<FormDescription>
										Path to prepend when forwarding to target
									</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name="priority"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Priority</FormLabel>
									<FormControl>
										<NumberInput
											placeholder="0"
											{...field}
											value={field.value}
											onChange={(e) => field.onChange(Number.parseInt(e.target.value, 10))}
										/>
									</FormControl>
									<FormDescription>
										Router priority (higher = matched first)
									</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>
					</form>

					<DialogFooter className="flex w-full flex-row !justify-end">
						<Button
							isLoading={isLoading}
							form="hook-form-add-proxy"
							type="submit"
						>
							{proxyId ? "Update" : "Create"}
						</Button>
					</DialogFooter>
				</Form>
			</DialogContent>
		</Dialog>
	);
};


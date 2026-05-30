import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { PenBoxIcon, PlusIcon, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { AlertBlock } from "@/components/shared/alert-block";
import { Badge } from "@/components/ui/badge";
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
import { CLOUDFLARE_SESSION_DURATIONS } from "./session-durations";

const isValidEmail = (value: string) =>
	/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const cloudflareSchema = z.object({
	name: z.string().min(1, "Name is required"),
	apiToken: z.string(),
	accountId: z.string().min(1, "Account ID is required"),
	defaultTunnelId: z.string().optional(),
	defaultSessionDuration: z.string().optional(),
	protectDomainsByDefault: z.boolean().optional(),
	requireProtectedDomains: z.boolean().optional(),
	defaultAllowEmails: z.array(z.string()).optional(),
	defaultAllowEmailDomains: z.array(z.string()).optional(),
});

type CloudflareForm = z.infer<typeof cloudflareSchema>;

interface Props {
	cloudflareId?: string;
}

export const HandleCloudflare = ({ cloudflareId }: Props) => {
	const [open, setOpen] = useState(false);
	const utils = api.useUtils();

	const createMutation = api.cloudflare.create.useMutation();
	const updateMutation = api.cloudflare.update.useMutation();
	const { isError, error, isPending } = cloudflareId
		? updateMutation
		: createMutation;

	const { data: integration } = api.cloudflare.one.useQuery(
		{ cloudflareId: cloudflareId || "" },
		{ enabled: !!cloudflareId, refetchOnWindowFocus: false },
	);

	const {
		mutateAsync: testConnection,
		isPending: isPendingConnection,
		error: connectionError,
		isError: isErrorConnection,
	} = api.cloudflare.testConnection.useMutation();

	const [emailInput, setEmailInput] = useState("");
	const [emailDomainInput, setEmailDomainInput] = useState("");

	const form = useForm<CloudflareForm>({
		defaultValues: {
			name: "",
			apiToken: "",
			accountId: "",
			defaultTunnelId: "",
			defaultSessionDuration: "168h",
			protectDomainsByDefault: false,
			requireProtectedDomains: false,
			defaultAllowEmails: [],
			defaultAllowEmailDomains: [],
		},
		resolver: zodResolver(cloudflareSchema),
	});

	useEffect(() => {
		if (integration) {
			form.reset({
				name: integration.name,
				// Token is write-only: it is never returned, so we keep it blank.
				apiToken: "",
				accountId: integration.accountId,
				defaultTunnelId: integration.defaultTunnelId ?? "",
				defaultSessionDuration: integration.defaultSessionDuration ?? "168h",
				protectDomainsByDefault: integration.protectDomainsByDefault ?? false,
				requireProtectedDomains: integration.requireProtectedDomains ?? false,
				defaultAllowEmails: integration.defaultAllowEmails ?? [],
				defaultAllowEmailDomains: integration.defaultAllowEmailDomains ?? [],
			});
		} else {
			form.reset();
		}
	}, [form, integration]);

	const onSubmit = async (data: CloudflareForm) => {
		if (!cloudflareId && !data.apiToken) {
			form.setError("apiToken", { message: "API Token is required" });
			return;
		}

		const payload = {
			name: data.name,
			accountId: data.accountId,
			// Send `null` (not `undefined`) when emptied so an existing default
			// can be cleared — `undefined` would be omitted from the update.
			defaultTunnelId: data.defaultTunnelId || null,
		};

		const action = cloudflareId
			? updateMutation.mutateAsync({
					cloudflareId,
					// Only send the token when the user typed a new one.
					...(data.apiToken ? { apiToken: data.apiToken } : {}),
					...payload,
					// Org Access defaults & policy (edit-only section below).
					defaultSessionDuration: data.defaultSessionDuration || "168h",
					protectDomainsByDefault: data.protectDomainsByDefault ?? false,
					requireProtectedDomains: data.requireProtectedDomains ?? false,
					defaultAllowEmails: data.defaultAllowEmails ?? [],
					defaultAllowEmailDomains: data.defaultAllowEmailDomains ?? [],
				})
			: createMutation.mutateAsync({ apiToken: data.apiToken, ...payload });

		await action
			.then(async () => {
				toast.success(
					`Cloudflare integration ${cloudflareId ? "updated" : "created"}`,
				);
				await utils.cloudflare.all.invalidate();
				if (cloudflareId) {
					await utils.cloudflare.one.invalidate({ cloudflareId });
				}
				// Clear the submitted token from form state so reopening the dialog
				// (the component stays mounted) never re-displays the write-only secret.
				form.reset();
				setOpen(false);
			})
			.catch((e) => {
				toast.error(
					`Error ${cloudflareId ? "updating" : "creating"} the Cloudflare integration`,
					{ description: e.message },
				);
			});
	};

	const handleTestConnection = async () => {
		const valid = await form.trigger(["apiToken", "accountId"]);
		if (!valid) {
			return;
		}
		const apiToken = form.getValues("apiToken");
		const accountId = form.getValues("accountId");
		// When editing, the token field is blank because the secret is write-only;
		// test against the stored token by passing the integration id instead.
		if (!apiToken && !cloudflareId) {
			form.setError("apiToken", {
				message: "Enter an API token to test the connection",
			});
			return;
		}

		await testConnection({
			accountId,
			...(apiToken ? { apiToken } : { cloudflareId }),
		})
			.then(() => {
				toast.success("Connection successful");
			})
			.catch((e) => {
				toast.error("Error connecting to Cloudflare", {
					description: e.message,
				});
			});
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				{cloudflareId ? (
					<Button
						variant="ghost"
						size="icon"
						className="group hover:bg-blue-500/10"
					>
						<PenBoxIcon className="size-3.5 text-primary group-hover:text-blue-500" />
					</Button>
				) : (
					<Button className="cursor-pointer space-x-3">
						<PlusIcon className="h-4 w-4" />
						Add Cloudflare Integration
					</Button>
				)}
			</DialogTrigger>
			<DialogContent className="sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>
						{cloudflareId ? "Update" : "Add"} Cloudflare Integration
					</DialogTitle>
					<DialogDescription>
						Connect a Cloudflare account using a scoped API token. The token is
						used to manage DNS, tunnels and access for published domains.
					</DialogDescription>
				</DialogHeader>
				{(isError || isErrorConnection) && (
					<AlertBlock type="error" className="w-full">
						{connectionError?.message || error?.message}
					</AlertBlock>
				)}

				<Form {...form}>
					<form
						id="hook-form-cloudflare-add"
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
										<Input placeholder="Production Cloudflare" {...field} />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="apiToken"
							render={({ field }) => (
								<FormItem>
									<FormLabel>API Token</FormLabel>
									<FormControl>
										<Input
											type="password"
											autoComplete="off"
											placeholder={
												cloudflareId
													? "Leave blank to keep the current token"
													: "Scoped Cloudflare API token"
											}
											{...field}
										/>
									</FormControl>
									<FormDescription>
										Create a token with Account &gt; Cloudflare Tunnel, Zone
										&gt; DNS, Account &gt; Access and Account &gt; Account
										Settings (Read) permissions. Account Settings Read lets the
										Test connection check confirm access to the account.
									</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="accountId"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Account ID</FormLabel>
									<FormControl>
										<Input
											placeholder="023e105f4ecef8ad9ca31a8372d0c353"
											{...field}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="defaultTunnelId"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Default Tunnel ID (Optional)</FormLabel>
									<FormControl>
										<Input
											placeholder="Existing tunnel to route through by default"
											{...field}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						{/* Org-level Access defaults & policy. Edit-only: the create flow
						    saves credentials first, then these are configured here. */}
						{cloudflareId && (
							<div className="flex flex-col gap-4 border-t pt-4">
								<div className="flex flex-col gap-0.5">
									<span className="text-sm font-medium">
										Access defaults & policy
									</span>
									<span className="text-xs text-muted-foreground">
										Defaults applied when domains are protected with Cloudflare
										Access, plus organization-wide protection policy.
									</span>
								</div>

								<FormField
									control={form.control}
									name="defaultSessionDuration"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Default Access Session Duration</FormLabel>
											<Select
												onValueChange={field.onChange}
												value={field.value || "168h"}
											>
												<FormControl>
													<SelectTrigger>
														<SelectValue />
													</SelectTrigger>
												</FormControl>
												<SelectContent>
													{CLOUDFLARE_SESSION_DURATIONS.map((duration) => (
														<SelectItem
															key={duration.value}
															value={duration.value}
														>
															{duration.label}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
											<FormMessage />
										</FormItem>
									)}
								/>

								<FormField
									control={form.control}
									name="defaultAllowEmails"
									render={({ field }) => {
										const values = field.value ?? [];
										const add = () => {
											const value = emailInput.trim();
											if (!value) return;
											if (!isValidEmail(value)) {
												toast.error("Enter a valid email address");
												return;
											}
											if (!values.includes(value)) {
												field.onChange([...values, value]);
											}
											setEmailInput("");
										};
										return (
											<FormItem>
												<FormLabel>Default Allowed Emails</FormLabel>
												{values.length > 0 && (
													<div className="flex flex-wrap gap-2">
														{values.map((email) => (
															<Badge key={email} variant="secondary">
																{email}
																<X
																	className="ml-1 size-3 cursor-pointer"
																	onClick={() =>
																		field.onChange(
																			values.filter((e) => e !== email),
																		)
																	}
																/>
															</Badge>
														))}
													</div>
												)}
												<div className="flex gap-2">
													<Input
														placeholder="user@example.com"
														value={emailInput}
														onChange={(e) => setEmailInput(e.target.value)}
														onKeyDown={(e) => {
															if (e.key === "Enter") {
																e.preventDefault();
																add();
															}
														}}
													/>
													<Button
														type="button"
														variant="secondary"
														onClick={add}
													>
														Add
													</Button>
												</div>
												<FormDescription>
													Used to gate auto-protected domains when they have no
													identities of their own.
												</FormDescription>
												<FormMessage />
											</FormItem>
										);
									}}
								/>

								<FormField
									control={form.control}
									name="defaultAllowEmailDomains"
									render={({ field }) => {
										const values = field.value ?? [];
										const add = () => {
											const value = emailDomainInput.trim();
											if (!value) return;
											if (!values.includes(value)) {
												field.onChange([...values, value]);
											}
											setEmailDomainInput("");
										};
										return (
											<FormItem>
												<FormLabel>Default Allowed Email Domains</FormLabel>
												{values.length > 0 && (
													<div className="flex flex-wrap gap-2">
														{values.map((domain) => (
															<Badge key={domain} variant="secondary">
																{domain}
																<X
																	className="ml-1 size-3 cursor-pointer"
																	onClick={() =>
																		field.onChange(
																			values.filter((d) => d !== domain),
																		)
																	}
																/>
															</Badge>
														))}
													</div>
												)}
												<div className="flex gap-2">
													<Input
														placeholder="example.com"
														value={emailDomainInput}
														onChange={(e) =>
															setEmailDomainInput(e.target.value)
														}
														onKeyDown={(e) => {
															if (e.key === "Enter") {
																e.preventDefault();
																add();
															}
														}}
													/>
													<Button
														type="button"
														variant="secondary"
														onClick={add}
													>
														Add
													</Button>
												</div>
												<FormMessage />
											</FormItem>
										);
									}}
								/>

								<FormField
									control={form.control}
									name="protectDomainsByDefault"
									render={({ field }) => (
										<FormItem className="flex flex-row items-center justify-between p-3 border rounded-lg shadow-sm">
											<div className="space-y-0.5">
												<FormLabel>Protect new domains by default</FormLabel>
												<FormDescription>
													New domains are automatically published via Cloudflare
													Tunnel and gated with Cloudflare Access using the
													defaults above.
												</FormDescription>
											</div>
											<FormControl>
												<Switch
													checked={!!field.value}
													onCheckedChange={field.onChange}
												/>
											</FormControl>
										</FormItem>
									)}
								/>

								<FormField
									control={form.control}
									name="requireProtectedDomains"
									render={({ field }) => (
										<FormItem className="flex flex-row items-center justify-between p-3 border rounded-lg shadow-sm">
											<div className="space-y-0.5">
												<FormLabel>
													Require all domains to be protected
												</FormLabel>
												<FormDescription>
													Members can only create protected (Tunnel + Access)
													domains; owners and admins may still create an
													unprotected one. Configure at least one default
													identity above first.
												</FormDescription>
											</div>
											<FormControl>
												<Switch
													checked={!!field.value}
													onCheckedChange={field.onChange}
												/>
											</FormControl>
										</FormItem>
									)}
								/>
							</div>
						)}
					</form>

					<DialogFooter className="flex w-full !justify-between gap-4 flex-row">
						<Button
							isLoading={isPendingConnection}
							type="button"
							variant="secondary"
							onClick={handleTestConnection}
						>
							Test connection
						</Button>
						<Button
							isLoading={isPending}
							form="hook-form-cloudflare-add"
							type="submit"
						>
							{cloudflareId ? "Update" : "Create"}
						</Button>
					</DialogFooter>
				</Form>
			</DialogContent>
		</Dialog>
	);
};

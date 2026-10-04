import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { CheckCircle2, PenBoxIcon, PlugZap, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
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
import { api } from "@/utils/api";
import {
	createDodomainSchema,
	DODOMAIN_DEFAULT_BASE_URL,
	type DoDomainForm,
	dodomainDashboardUrl,
} from "./dodomain-form-schema";

export { DODOMAIN_DEFAULT_BASE_URL };

interface Props {
	/** Present when editing the organization's existing integration. */
	editing?: boolean;
}

type TestResult = {
	apps: { id: string; name: string; sandbox: boolean }[];
	appFound: boolean;
};

export const HandleDoDomain = ({ editing = false }: Props) => {
	const [open, setOpen] = useState(false);
	const [testResult, setTestResult] = useState<TestResult | null>(null);
	const utils = api.useUtils();

	const createMutation = api.dodomain.create.useMutation();
	const updateMutation = api.dodomain.update.useMutation();
	const { isError, error, isPending } = editing
		? updateMutation
		: createMutation;
	const testMutation = api.dodomain.testConnection.useMutation();

	const { data: integration } = api.dodomain.one.useQuery(undefined, {
		enabled: editing && open,
		refetchOnWindowFocus: false,
	});

	const schema = useMemo(() => createDodomainSchema({ editing }), [editing]);

	const form = useForm<DoDomainForm>({
		// Validate a field when it is left, then on every change, so a pasted
		// http:// base URL or a wrong key is flagged before pressing Connect.
		mode: "onTouched",
		defaultValues: {
			name: "DoDomain",
			secretKey: "",
			appId: "",
			baseUrl: DODOMAIN_DEFAULT_BASE_URL,
		},
		resolver: zodResolver(schema),
	});

	useEffect(() => {
		if (editing && integration) {
			form.reset({
				name: integration.name,
				// The key is write-only: it is never returned, so keep it blank.
				secretKey: "",
				appId: integration.appId,
				baseUrl: integration.baseUrl,
			});
		}
	}, [editing, form, integration]);

	useEffect(() => {
		if (!open) setTestResult(null);
	}, [open]);

	const appId = form.watch("appId");
	// "DoDomain dashboard" links to the instance the Base URL points at.
	const dashboardUrl = dodomainDashboardUrl(form.watch("baseUrl") ?? "");

	const onSubmit = async (data: DoDomainForm) => {
		// The schema already checked the key: required when connecting, a
		// dd_sk_ prefix whenever one is typed.
		const secretKey = data.secretKey.trim();
		const common = {
			name: data.name,
			appId: data.appId,
			baseUrl: data.baseUrl,
		};
		const action = editing
			? updateMutation.mutateAsync({
					...common,
					...(secretKey ? { secretKey } : {}),
				})
			: createMutation.mutateAsync({ ...common, secretKey });

		await action
			.then(async () => {
				toast.success(`DoDomain ${editing ? "updated" : "connected"}`, {
					description: "The webhook endpoint is registered with DoDomain.",
				});
				await utils.dodomain.one.invalidate();
				await utils.dodomain.configured.invalidate();
				// Never keep the submitted key in form state.
				form.setValue("secretKey", "");
				setOpen(false);
			})
			.catch((e) => {
				toast.error(`Error ${editing ? "updating" : "connecting"} DoDomain`, {
					description: e.message,
				});
			});
	};

	const handleTestConnection = async () => {
		// Only the fields the test uses: App ID may stay blank, Test connection
		// fills it in. When editing, a blank key falls back to the stored one.
		const valid = await form.trigger(["baseUrl", "secretKey"], {
			shouldFocus: true,
		});
		if (!valid) return;
		const secretKey = form.getValues("secretKey").trim();
		const typedAppId = form.getValues("appId").trim();
		setTestResult(null);
		await testMutation
			.mutateAsync({
				baseUrl: form.getValues("baseUrl"),
				...(typedAppId ? { appId: typedAppId } : {}),
				...(secretKey ? { secretKey } : {}),
			})
			.then((result) => {
				setTestResult(result);
				// A secret key belongs to exactly one app: fill it in.
				const onlyApp = result.apps[0];
				if (!typedAppId && result.apps.length === 1 && onlyApp) {
					form.setValue("appId", onlyApp.id, { shouldValidate: true });
					setTestResult({ ...result, appFound: true });
					toast.success("Connection successful", {
						description: `Using app "${onlyApp.name}".`,
					});
					return;
				}
				if (result.appFound) {
					toast.success("Connection successful");
				} else {
					toast.error("Connected, but the app id does not match the key", {
						description: "Pick the app listed below.",
					});
				}
			})
			.catch((e) => {
				toast.error("Error connecting to DoDomain", {
					description: e.message,
				});
			});
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				{editing ? (
					<Button
						variant="ghost"
						size="icon"
						className="group hover:bg-blue-500/10"
						aria-label="Edit DoDomain integration"
					>
						<PenBoxIcon className="size-3.5 text-primary group-hover:text-blue-500" />
					</Button>
				) : (
					<Button className="cursor-pointer space-x-3">
						<PlugZap className="h-4 w-4" />
						<span>Connect DoDomain</span>
					</Button>
				)}
			</DialogTrigger>
			<DialogContent className="sm:max-w-2xl overflow-hidden">
				<DialogHeader>
					<DialogTitle>{editing ? "Update" : "Connect"} DoDomain</DialogTitle>
					<DialogDescription>
						Connect one DoDomain app to this organization with its secret key.
						Domains can then send their owners a connect link from the
						service&apos;s Domains tab.
					</DialogDescription>
				</DialogHeader>
				<div className="flex min-h-0 flex-col gap-4 overflow-y-auto">
					{(isError || testMutation.isError) && (
						<AlertBlock type="error" className="w-full">
							{testMutation.error?.message || error?.message}
						</AlertBlock>
					)}
					<AlertBlock type="info" className="w-full">
						Saving registers a webhook endpoint on this panel&apos;s public URL
						(<span className="font-mono">/api/webhooks/dodomain</span>) so
						DoDomain can report verification results. The panel must be
						reachable over https (Settings → Web Server).
					</AlertBlock>

					<Form {...form}>
						<form
							id="hook-form-dodomain"
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
											<Input placeholder="DoDomain" {...field} />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="secretKey"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Secret key</FormLabel>
										<FormControl>
											<Input
												type="password"
												autoComplete="off"
												placeholder={
													editing
														? `Leave blank to keep the current key${
																integration?.secretKeyMasked
																	? ` (${integration.secretKeyMasked})`
																	: ""
															}`
														: "dd_sk_..."
												}
												{...field}
											/>
										</FormControl>
										<FormDescription>
											In the{" "}
											<a
												href={dashboardUrl}
												target="_blank"
												rel="noopener noreferrer"
												className="underline underline-offset-2 hover:text-foreground"
											>
												DoDomain dashboard
											</a>
											, copy your app&apos;s server-side secret key (starts with{" "}
											<span className="font-mono">dd_sk_</span>). It is stored on
											this server and never shown again here.
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="appId"
								render={({ field }) => (
									<FormItem>
										<FormLabel>App ID</FormLabel>
										<FormControl>
											<Input
												placeholder="Filled in by Test connection"
												{...field}
											/>
										</FormControl>
										<FormDescription>
											Leave it blank and use Test connection to fill it in from
											the key.
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>
							{testResult && (
								<div className="flex flex-col gap-2 rounded-lg border p-3">
									<span className="text-sm font-medium">
										App this key belongs to
									</span>
									{testResult.apps.length === 0 ? (
										<span className="text-xs text-muted-foreground">
											None. Check that the key is still active in DoDomain.
										</span>
									) : (
										testResult.apps.map((app) => {
											const selected = app.id === appId;
											return (
												<button
													type="button"
													key={app.id}
													onClick={() =>
														form.setValue("appId", app.id, {
															shouldValidate: true,
														})
													}
													className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm hover:bg-muted"
												>
													<span className="flex flex-col">
														<span>
															{app.name}
															{app.sandbox && " (sandbox)"}
														</span>
														<span className="font-mono text-xs text-muted-foreground">
															{app.id}
														</span>
													</span>
													{selected ? (
														<CheckCircle2 className="size-4 text-green-600" />
													) : (
														<span className="text-xs text-muted-foreground">
															Use this app
														</span>
													)}
												</button>
											);
										})
									)}
									{!testResult.appFound && testResult.apps.length > 0 && (
										<span className="flex items-center gap-1 text-xs text-red-500">
											<XCircle className="size-3" />
											The app id above does not match the key.
										</span>
									)}
								</div>
							)}
							<FormField
								control={form.control}
								name="baseUrl"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Base URL</FormLabel>
										<FormControl>
											<Input
												placeholder={DODOMAIN_DEFAULT_BASE_URL}
												{...field}
											/>
										</FormControl>
										<FormDescription>
											Change only for a self-hosted DoDomain. Must use https
											(http is allowed only for localhost).
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>
						</form>
					</Form>
				</div>

				<DialogFooter className="flex w-full !justify-between gap-4 flex-row">
					<Button
						isLoading={testMutation.isPending}
						type="button"
						variant="secondary"
						onClick={handleTestConnection}
					>
						Test connection
					</Button>
					<Button isLoading={isPending} form="hook-form-dodomain" type="submit">
						{editing ? "Update" : "Connect"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};

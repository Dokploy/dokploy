import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { CheckCircle2, PenBoxIcon, PlugZap, XCircle } from "lucide-react";
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
import { api } from "@/utils/api";

export const UPTIMELY_DEFAULT_BASE_URL = "https://app.getuptimely.com";

const uptimelySchema = z.object({
	name: z.string().trim().min(1, "Name is required"),
	apiKey: z.string(),
	projectId: z.string().trim().uuid("The Uptimely project id is a UUID"),
	baseUrl: z.string().trim().url("Enter a valid URL"),
	statusPageSlug: z.string().trim().optional(),
});

type UptimelyForm = z.infer<typeof uptimelySchema>;

interface Props {
	/** Present when editing the organization's existing integration. */
	editing?: boolean;
}

type TestResult = {
	projects: { id: string; name: string; slug: string }[];
	projectFound: boolean;
};

export const HandleUptimely = ({ editing = false }: Props) => {
	const [open, setOpen] = useState(false);
	const [testResult, setTestResult] = useState<TestResult | null>(null);
	const utils = api.useUtils();

	const createMutation = api.uptimely.create.useMutation();
	const updateMutation = api.uptimely.update.useMutation();
	const { isError, error, isPending } = editing
		? updateMutation
		: createMutation;
	const testMutation = api.uptimely.testConnection.useMutation();

	const { data: integration } = api.uptimely.one.useQuery(undefined, {
		enabled: editing && open,
		refetchOnWindowFocus: false,
	});
	const { data: statusPages } = api.uptimely.statusPages.useQuery(undefined, {
		enabled: editing && open,
		refetchOnWindowFocus: false,
		retry: false,
	});

	const form = useForm<UptimelyForm>({
		defaultValues: {
			name: "Uptimely",
			apiKey: "",
			projectId: "",
			baseUrl: UPTIMELY_DEFAULT_BASE_URL,
			statusPageSlug: "",
		},
		resolver: zodResolver(uptimelySchema),
	});

	useEffect(() => {
		if (editing && integration) {
			form.reset({
				name: integration.name,
				// The key is write-only: it is never returned, so keep it blank.
				apiKey: "",
				projectId: integration.projectId,
				baseUrl: integration.baseUrl,
				statusPageSlug: integration.statusPageSlug ?? "",
			});
		}
	}, [editing, form, integration]);

	useEffect(() => {
		if (!open) setTestResult(null);
	}, [open]);

	const baseUrl = form.watch("baseUrl") || UPTIMELY_DEFAULT_BASE_URL;
	const projectId = form.watch("projectId");
	const apiKeysUrl = `${baseUrl.replace(/\/+$/, "")}/dashboard/${
		projectId || "default"
	}/settings/api-keys`;

	const onSubmit = async (data: UptimelyForm) => {
		if (!editing && !data.apiKey.trim()) {
			form.setError("apiKey", { message: "API key is required" });
			return;
		}
		const common = {
			name: data.name,
			projectId: data.projectId,
			baseUrl: data.baseUrl,
		};
		const action = editing
			? updateMutation.mutateAsync({
					...common,
					...(data.apiKey.trim() ? { apiKey: data.apiKey } : {}),
					// null clears a previously stored slug.
					statusPageSlug: data.statusPageSlug || null,
				})
			: createMutation.mutateAsync({
					...common,
					apiKey: data.apiKey,
					statusPageSlug: data.statusPageSlug || null,
				});

		await action
			.then(async () => {
				toast.success(`Uptimely ${editing ? "updated" : "connected"}`);
				await utils.uptimely.one.invalidate();
				await utils.uptimely.statusPages.invalidate();
				await utils.uptimely.serviceStatus.invalidate();
				// Never keep the submitted key in form state.
				form.setValue("apiKey", "");
				setOpen(false);
			})
			.catch((e) => {
				toast.error(`Error ${editing ? "updating" : "connecting"} Uptimely`, {
					description: e.message,
				});
			});
	};

	const handleTestConnection = async () => {
		const valid = await form.trigger(["baseUrl"]);
		if (!valid) return;
		const typedProjectId = form.getValues("projectId").trim();
		const projectIdToTest = uptimelySchema.shape.projectId.safeParse(
			typedProjectId,
		).success
			? typedProjectId
			: undefined;
		const apiKey = form.getValues("apiKey").trim();
		if (!apiKey && !editing) {
			form.setError("apiKey", {
				message: "Enter an API key to test the connection",
			});
			return;
		}
		setTestResult(null);
		await testMutation
			.mutateAsync({
				baseUrl: form.getValues("baseUrl"),
				...(projectIdToTest ? { projectId: projectIdToTest } : {}),
				...(apiKey ? { apiKey } : {}),
			})
			.then((result) => {
				setTestResult(result);
				// A project API key reaches exactly one project: fill it in.
				const onlyProject = result.projects[0];
				if (!projectIdToTest && result.projects.length === 1 && onlyProject) {
					form.setValue("projectId", onlyProject.id, { shouldValidate: true });
					setTestResult({ ...result, projectFound: true });
					toast.success("Connection successful", {
						description: `Using project "${onlyProject.name}".`,
					});
					return;
				}
				if (result.projectFound) {
					toast.success("Connection successful");
				} else {
					toast.error("Connected, but the project id is not accessible", {
						description: "Pick one of the projects listed below.",
					});
				}
			})
			.catch((e) => {
				toast.error("Error connecting to Uptimely", {
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
						aria-label="Edit Uptimely integration"
					>
						<PenBoxIcon className="size-3.5 text-primary group-hover:text-blue-500" />
					</Button>
				) : (
					<Button className="cursor-pointer space-x-3">
						<PlugZap className="h-4 w-4" />
						<span>Connect Uptimely</span>
					</Button>
				)}
			</DialogTrigger>
			<DialogContent className="sm:max-w-2xl overflow-hidden">
				<DialogHeader>
					<DialogTitle>{editing ? "Update" : "Connect"} Uptimely</DialogTitle>
					<DialogDescription>
						Connect one Uptimely project to this organization using a project
						API key. Services can then be monitored from their Monitoring tab.
					</DialogDescription>
				</DialogHeader>
				<div className="flex min-h-0 flex-col gap-4 overflow-y-auto">
					{(isError || testMutation.isError) && (
						<AlertBlock type="error" className="w-full">
							{testMutation.error?.message || error?.message}
						</AlertBlock>
					)}
					<AlertBlock type="info" className="w-full">
						Creating monitors and running probes are write operations in
						Uptimely: turn on{" "}
						<span className="font-medium">AI write operations</span> for the
						project in{" "}
						<a
							href={apiKeysUrl}
							target="_blank"
							rel="noopener noreferrer"
							className="underline"
						>
							Uptimely → Settings → API Keys
						</a>{" "}
						or monitor creation will be refused. Reading status works either
						way.
					</AlertBlock>

					<Form {...form}>
						<form
							id="hook-form-uptimely"
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
											<Input placeholder="Uptimely" {...field} />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="apiKey"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Project API key</FormLabel>
										<FormControl>
											<Input
												type="password"
												autoComplete="off"
												placeholder={
													editing
														? `Leave blank to keep the current key${
																integration?.apiKeyMasked
																	? ` (${integration.apiKeyMasked})`
																	: ""
															}`
														: "Uptimely project API key"
												}
												{...field}
											/>
										</FormControl>
										<FormDescription>
											Create one in Uptimely under Settings → API Keys. The key
											is locked to a single project and is never shown again
											here.
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="projectId"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Project ID</FormLabel>
										<FormControl>
											<Input
												placeholder="00000000-0000-0000-0000-000000000000"
												{...field}
											/>
										</FormControl>
										<FormDescription>
											Leave it blank and use Test connection to fill it in from
											the projects the key can reach.
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>
							{testResult && (
								<div className="flex flex-col gap-2 rounded-lg border p-3">
									<span className="text-sm font-medium">
										Projects this key can access
									</span>
									{testResult.projects.length === 0 ? (
										<span className="text-xs text-muted-foreground">
											None. Check that the key is still active in Uptimely.
										</span>
									) : (
										testResult.projects.map((project) => {
											const selected = project.id === projectId;
											return (
												<button
													type="button"
													key={project.id}
													onClick={() =>
														form.setValue("projectId", project.id, {
															shouldValidate: true,
														})
													}
													className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm hover:bg-muted"
												>
													<span className="flex flex-col">
														<span>{project.name}</span>
														<span className="font-mono text-xs text-muted-foreground">
															{project.id}
														</span>
													</span>
													{selected ? (
														<CheckCircle2 className="size-4 text-green-600" />
													) : (
														<span className="text-xs text-muted-foreground">
															Use this project
														</span>
													)}
												</button>
											);
										})
									)}
									{!testResult.projectFound &&
										testResult.projects.length > 0 && (
											<span className="flex items-center gap-1 text-xs text-red-500">
												<XCircle className="size-3" />
												The project id above is not one of these.
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
												placeholder={UPTIMELY_DEFAULT_BASE_URL}
												{...field}
											/>
										</FormControl>
										<FormDescription>
											Change only for a self-hosted Uptimely.
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="statusPageSlug"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Status page slug (optional)</FormLabel>
										<FormControl>
											<Input placeholder="my-status-page" {...field} />
										</FormControl>
										{editing && statusPages && statusPages.length > 0 && (
											<div className="flex flex-wrap gap-2">
												{statusPages.map((page) => (
													<Badge
														key={page.id}
														variant={
															page.slug === field.value
																? "default"
																: "secondary"
														}
														className="cursor-pointer"
														onClick={() =>
															form.setValue("statusPageSlug", page.slug)
														}
													>
														{page.name}
														{!page.isPublic && " (private)"}
													</Badge>
												))}
											</div>
										)}
										<FormDescription>
											When set, the public status badge is shown on each
											monitored service. Only public status pages have a badge.
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
					<Button isLoading={isPending} form="hook-form-uptimely" type="submit">
						{editing ? "Update" : "Connect"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};

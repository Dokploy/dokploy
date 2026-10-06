import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { PenBoxIcon, PlugZap } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { api } from "@/utils/api";
import { SNAPVISOR_DEFAULT_BASE_URL } from "@dokploy/server/utils/snapvisor/urls";

const snapvisorSchema = z.object({
	name: z.string().trim().min(1, "Name is required"),
	accessToken: z.string(),
	accountSlug: z.string().trim().min(1, "Account slug is required"),
	baseUrl: z
		.string()
		.trim()
		.url("Enter a valid URL")
		.refine((value) => /^https?:\/\//i.test(value), "Use an http(s) URL"),
});

type SnapvisorForm = z.infer<typeof snapvisorSchema>;

interface Props {
	/** Present when editing the organization's existing integration. */
	editing?: boolean;
}

export const HandleSnapvisor = ({ editing = false }: Props) => {
	const [open, setOpen] = useState(false);
	const utils = api.useUtils();

	const createMutation = api.snapvisor.create.useMutation();
	const updateMutation = api.snapvisor.update.useMutation();
	const { isError, error, isPending } = editing
		? updateMutation
		: createMutation;
	const testMutation = api.snapvisor.testConnection.useMutation();

	const { data: integration } = api.snapvisor.one.useQuery(undefined, {
		enabled: editing && open,
		refetchOnWindowFocus: false,
	});

	const form = useForm<SnapvisorForm>({
		defaultValues: {
			name: "Snapvisor",
			accessToken: "",
			accountSlug: "",
			baseUrl: SNAPVISOR_DEFAULT_BASE_URL,
		},
		resolver: zodResolver(snapvisorSchema),
	});

	useEffect(() => {
		if (editing && integration) {
			form.reset({
				name: integration.name,
				// The token is write-only: it is never returned, so keep it blank.
				accessToken: "",
				accountSlug: integration.accountSlug,
				baseUrl: integration.baseUrl,
			});
		}
	}, [editing, form, integration]);

	const onSubmit = async (data: SnapvisorForm) => {
		if (!editing && !data.accessToken.trim()) {
			form.setError("accessToken", { message: "Access token is required" });
			return;
		}
		const common = {
			name: data.name,
			accountSlug: data.accountSlug,
			baseUrl: data.baseUrl,
		};
		const action = editing
			? updateMutation.mutateAsync({
					...common,
					...(data.accessToken.trim() ? { accessToken: data.accessToken } : {}),
				})
			: createMutation.mutateAsync({
					...common,
					accessToken: data.accessToken,
				});

		await action
			.then(async () => {
				toast.success(`Snapvisor ${editing ? "updated" : "connected"}`);
				await utils.snapvisor.one.invalidate();
				await utils.snapvisor.projects.invalidate();
				// Never keep the submitted token in form state.
				form.setValue("accessToken", "");
				setOpen(false);
			})
			.catch((e) => {
				toast.error(`Error ${editing ? "updating" : "connecting"} Snapvisor`, {
					description: e.message,
				});
			});
	};

	const handleTestConnection = async () => {
		const valid = await form.trigger(["baseUrl"]);
		if (!valid) return;
		const accessToken = form.getValues("accessToken").trim();
		if (!accessToken && !editing) {
			form.setError("accessToken", {
				message: "Enter an access token to test the connection",
			});
			return;
		}
		await testMutation
			.mutateAsync({
				baseUrl: form.getValues("baseUrl"),
				...(accessToken ? { accessToken } : {}),
			})
			.then((result) => {
				toast.success("Connection successful", {
					description: `Accounts reachable: ${
						result.accounts.map((a) => a.slug).join(", ") || "none"
					}`,
				});
			})
			.catch((e) => {
				toast.error("Error connecting to Snapvisor", {
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
						aria-label="Edit Snapvisor integration"
					>
						<PenBoxIcon className="size-3.5 text-primary group-hover:text-blue-500" />
					</Button>
				) : (
					<Button className="cursor-pointer space-x-3">
						<PlugZap className="h-4 w-4" />
						<span>Connect Snapvisor</span>
					</Button>
				)}
			</DialogTrigger>
			<DialogContent className="sm:max-w-2xl overflow-hidden">
				<DialogHeader>
					<DialogTitle>{editing ? "Update" : "Connect"} Snapvisor</DialogTitle>
					<DialogDescription>
						Connect a Snapvisor account to this organization using a personal
						access token. Applications can then be linked to a Snapvisor project
						from their Preview Deployment settings.
					</DialogDescription>
				</DialogHeader>
				<div className="flex min-h-0 flex-col gap-4 overflow-y-auto">
					<AlertBlock type="info" className="w-full">
						Screenshots are still captured by the Snapvisor CLI in your own CI.
						Dokploy only finds the build Snapvisor already created for the
						commit it just deployed and shows its review status.
					</AlertBlock>

					<Form {...form}>
						<form
							id="hook-form-snapvisor"
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
											<Input placeholder="Snapvisor" {...field} />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="accessToken"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Personal access token</FormLabel>
										<FormControl>
											<Input
												type="password"
												autoComplete="off"
												placeholder={
													editing
														? `Leave blank to keep the current token${
																integration?.accessTokenMasked
																	? ` (${integration.accessTokenMasked})`
																	: ""
															}`
														: "Snapvisor personal access token"
												}
												{...field}
											/>
										</FormControl>
										<FormDescription>
											Create one in Snapvisor under your account settings. It is
											never shown again here.
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="accountSlug"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Account slug</FormLabel>
										<FormControl>
											<Input placeholder="my-team" {...field} />
										</FormControl>
										<FormDescription>
											The slug in your Snapvisor URLs, e.g. the{" "}
											<code className="text-xs">my-team</code> in
											app.snapvisor.io/my-team/my-project.
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="baseUrl"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Base URL</FormLabel>
										<FormControl>
											<Input
												placeholder={SNAPVISOR_DEFAULT_BASE_URL}
												{...field}
											/>
										</FormControl>
										<FormDescription>
											Change only for a self-hosted Snapvisor.
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>
						</form>
					</Form>
				</div>

				{/* Outside the scrolling form so a failure is never hidden above the
				    fold; a toast alone vanishes before it can be read. */}
				{(isError || testMutation.isError) && (
					<AlertBlock type="error" className="w-full" role="alert">
						{testMutation.error?.message || error?.message}
					</AlertBlock>
				)}

				<DialogFooter className="flex w-full !justify-between gap-4 flex-row">
					<Button
						isLoading={testMutation.isPending}
						type="button"
						variant="secondary"
						onClick={handleTestConnection}
					>
						Test connection
					</Button>
					<Button
						isLoading={isPending}
						form="hook-form-snapvisor"
						type="submit"
					>
						{editing ? "Update" : "Connect"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};

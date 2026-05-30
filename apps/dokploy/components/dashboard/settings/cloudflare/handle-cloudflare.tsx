import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { PenBoxIcon, PlusIcon } from "lucide-react";
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

const cloudflareSchema = z.object({
	name: z.string().min(1, "Name is required"),
	apiToken: z.string(),
	accountId: z.string().min(1, "Account ID is required"),
	defaultTunnelId: z.string().optional(),
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

	const form = useForm<CloudflareForm>({
		defaultValues: {
			name: "",
			apiToken: "",
			accountId: "",
			defaultTunnelId: "",
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

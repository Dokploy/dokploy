import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { Check, Copy, PenBoxIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { GitlabIcon } from "@/components/icons/data-tools-icons";
import { AlertBlock } from "@/components/shared/alert-block";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import {
	Dialog,
	DialogContent,
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

const Schema = z.object({
	name: z.string().min(1, {
		message: "Name is required",
	}),
	gitlabUrl: z.string().url({
		message: "Invalid Gitlab URL",
	}),
	gitlabInternalUrl: z
		.union([z.string().url(), z.literal("")])
		.optional()
		.transform((v) => (v === "" ? undefined : v)),
	groupName: z.string().optional(),
});

type Schema = z.infer<typeof Schema>;

interface Props {
	gitlabId: string;
}

export const EditGitlabProvider = ({ gitlabId }: Props) => {
	const { data: gitlab, refetch } = api.gitlab.one.useQuery(
		{
			gitlabId,
		},
		{
			enabled: !!gitlabId,
		},
	);
	const utils = api.useUtils();
	const [isOpen, setIsOpen] = useState(false);
	const [copiedWebhookUrl, setCopiedWebhookUrl] = useState(false);
	const [copiedSecret, setCopiedSecret] = useState(false);

	const webhookUrl =
		typeof window !== "undefined"
			? `${window.location.origin}/api/deploy/gitlab`
			: "/api/deploy/gitlab";

	const copyToClipboard = (
		text: string,
		setter: (v: boolean) => void,
	) => {
		navigator.clipboard.writeText(text);
		setter(true);
		toast.success("Copied to clipboard");
		setTimeout(() => setter(false), 2000);
	};
	const { mutateAsync, error, isError } = api.gitlab.update.useMutation();
	const { mutateAsync: testConnection, isPending } =
		api.gitlab.testConnection.useMutation();
	const form = useForm({
		defaultValues: {
			groupName: "",
			name: "",
			gitlabUrl: "https://gitlab.com",
			gitlabInternalUrl: "",
		},
		resolver: zodResolver(Schema),
	});

	const groupName = form.watch("groupName");

	useEffect(() => {
		form.reset({
			groupName: gitlab?.groupName || "",
			name: gitlab?.gitProvider.name || "",
			gitlabUrl: gitlab?.gitlabUrl || "",
			gitlabInternalUrl: gitlab?.gitlabInternalUrl || "",
		});
	}, [form, isOpen]);

	const onSubmit = async (data: Schema) => {
		await mutateAsync({
			gitlabId,
			gitProviderId: gitlab?.gitProviderId || "",
			groupName: data.groupName || "",
			name: data.name || "",
			gitlabUrl: data.gitlabUrl || "",
			gitlabInternalUrl: data.gitlabInternalUrl ?? null,
		})
			.then(async () => {
				await utils.gitProvider.getAll.invalidate();
				toast.success("Gitlab updated successfully");
				setIsOpen(false);
				refetch();
			})
			.catch(() => {
				toast.error("Error updating Gitlab");
			});
	};

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					className="group hover:bg-blue-500/10 "
				>
					<PenBoxIcon className="size-3.5  text-primary group-hover:text-blue-500" />
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-2xl ">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						Update GitLab <GitlabIcon className="size-5" />
					</DialogTitle>
				</DialogHeader>

				{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}
				<Form {...form}>
					<form
						id="hook-form-add-bitbucket"
						onSubmit={form.handleSubmit(onSubmit)}
						className="grid w-full gap-1"
					>
						<CardContent className="p-0">
							<div className="flex flex-col gap-4">
								<FormField
									control={form.control}
									name="name"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Name</FormLabel>
											<FormControl>
												<Input
													placeholder="Random Name eg(my-personal-account)"
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="gitlabUrl"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Gitlab Url</FormLabel>
											<FormControl>
												<Input placeholder="https://gitlab.com" {...field} />
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>

								<FormField
									control={form.control}
									name="gitlabInternalUrl"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Internal URL (Optional)</FormLabel>
											<FormControl>
												<Input
													placeholder="http://gitlab:80"
													{...field}
													value={field.value ?? ""}
												/>
											</FormControl>
											<FormDescription>
												Use when GitLab runs on the same instance as Dokploy.
												Used for OAuth token exchange to reach GitLab via
												internal network (e.g. Docker service name).
											</FormDescription>
											<FormMessage />
										</FormItem>
									)}
								/>

								<FormField
									control={form.control}
									name="groupName"
									render={({ field }) => (
										<FormItem>
											<FormLabel>
												Group Name (Optional, Comma-Separated List)
											</FormLabel>
											<FormControl>
												<Input
													placeholder="For organization/group access use the slugish name of the group eg: my-org"
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>

								<div className="flex flex-col gap-2">
									<p className="text-sm font-medium">
										Webhook Configuration
									</p>
									<p className="text-sm text-muted-foreground">
										Configure these values in your GitLab project under{" "}
										<strong>Settings → Webhooks</strong>. Enable the{" "}
										<em>Merge requests events</em> and{" "}
										<em>Push events</em> triggers.
									</p>
									<div className="flex items-center gap-2">
										<Input
											readOnly
											value={webhookUrl}
											className="font-mono text-xs"
										/>
										<Button
											type="button"
											variant="outline"
											size="icon"
											onClick={() =>
												copyToClipboard(webhookUrl, setCopiedWebhookUrl)
											}
										>
											{copiedWebhookUrl ? (
												<Check className="size-4 text-green-500" />
											) : (
												<Copy className="size-4" />
											)}
										</Button>
									</div>
									{gitlab?.webhookSecret && (
										<div className="flex items-center gap-2">
											<Input
												readOnly
												type="password"
												value={gitlab.webhookSecret}
												className="font-mono text-xs"
											/>
											<Button
												type="button"
												variant="outline"
												size="icon"
												onClick={() =>
													copyToClipboard(
														gitlab.webhookSecret!,
														setCopiedSecret,
													)
												}
											>
												{copiedSecret ? (
													<Check className="size-4 text-green-500" />
												) : (
													<Copy className="size-4" />
												)}
											</Button>
										</div>
									)}
								</div>

								<div className="flex w-full justify-between gap-4 mt-4">
									<Button
										type="button"
										variant={"secondary"}
										isLoading={isPending}
										onClick={async () => {
											await testConnection({
												gitlabId,
												groupName: groupName || "",
											})
												.then(async (message) => {
													toast.info(`Message: ${message}`);
												})
												.catch((error) => {
													toast.error(`Error: ${error.message}`);
												});
										}}
									>
										Test Connection
									</Button>
									<Button type="submit" isLoading={form.formState.isSubmitting}>
										Update
									</Button>
								</div>
							</div>
						</CardContent>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
};

import { VALID_BRANCH_REGEX } from "@dokploy/server/utils/git-branch-validation";
import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { HelpCircle, KeyRoundIcon, LockIcon, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { z } from "zod";
import { GitIcon } from "@/components/icons/data-tools-icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
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

const GitProviderSchema = z.object({
	composePath: z.string().min(1),
	repositoryURL: z.string().min(1, {
		message: "compose.repositoryUrlRequired",
	}),
	branch: z
		.string()
		.min(1, "compose.branchRequired")
		.regex(VALID_BRANCH_REGEX, "compose.invalidBranchName"),
	sshKey: z.string().optional(),
	watchPaths: z.array(z.string()).optional(),
	enableSubmodules: z.boolean().default(false),
});

type GitProvider = z.infer<typeof GitProviderSchema>;

interface Props {
	composeId: string;
}

export const SaveGitProviderCompose = ({ composeId }: Props) => {
	const { t } = useTranslation();
	const { data, refetch } = api.compose.one.useQuery({ composeId });
	const { data: sshKeys } = api.sshKey.allForApps.useQuery();
	const router = useRouter();

	const { mutateAsync, isPending } = api.compose.update.useMutation();

	const form = useForm({
		defaultValues: {
			branch: "",
			repositoryURL: "",
			composePath: "./docker-compose.yml",
			sshKey: undefined,
			watchPaths: [],
			enableSubmodules: false,
		},
		resolver: zodResolver(GitProviderSchema),
	});

	useEffect(() => {
		if (data) {
			form.reset({
				sshKey: data.customGitSSHKeyId || undefined,
				branch: data.customGitBranch || "",
				repositoryURL: data.customGitUrl || "",
				composePath: data.composePath,
				watchPaths: data.watchPaths || [],
				enableSubmodules: data.enableSubmodules ?? false,
			});
		}
	}, [form.reset, data, form]);

	const onSubmit = async (values: GitProvider) => {
		await mutateAsync({
			customGitBranch: values.branch,
			customGitUrl: values.repositoryURL,
			customGitSSHKeyId: values.sshKey === "none" ? null : values.sshKey,
			composeId,
			sourceType: "git",
			composePath: values.composePath,
			watchPaths: values.watchPaths || [],
			enableSubmodules: values.enableSubmodules,
		})
			.then(async () => {
				toast.success(t("compose.gitProviderSaved"));
				await refetch();
			})
			.catch(() => {
				toast.error(t("compose.providerSaveError"));
			});
	};

	return (
		<Form {...form}>
			<form
				onSubmit={form.handleSubmit(onSubmit)}
				className="flex flex-col gap-4"
			>
				<div className="grid md:grid-cols-2 gap-4 ">
					<div className="flex items-end col-span-2 gap-4">
						<div className="grow">
							<FormField
								control={form.control}
								name="repositoryURL"
								render={({ field }) => (
									<FormItem>
										<div className="flex items-center justify-between">
											<FormLabel>{t("compose.repositoryUrl")}</FormLabel>
											{field.value?.startsWith("https://") && (
												<Link
													href={field.value}
													target="_blank"
													rel="noopener noreferrer"
													className="flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"
												>
													<GitIcon className="h-4 w-4" />
													<span>{t("compose.viewRepository")}</span>
												</Link>
											)}
										</div>
										<FormControl>
											<Input
												placeholder={t("compose.repositoryUrl")}
												{...field}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
						</div>
						{sshKeys && sshKeys.length > 0 ? (
							<FormField
								control={form.control}
								name="sshKey"
								render={({ field }) => (
									<FormItem className="basis-40">
										<FormLabel className="w-full inline-flex justify-between">
											{t("compose.sshKey")}
											<LockIcon className="size-4 text-muted-foreground" />
										</FormLabel>
										<FormControl>
											<Select
												key={field.value}
												onValueChange={field.onChange}
												defaultValue={field.value}
												value={field.value}
											>
												<SelectTrigger>
													<SelectValue placeholder={t("compose.selectKey")} />
												</SelectTrigger>
												<SelectContent>
													<SelectGroup>
														{sshKeys?.map((sshKey) => (
															<SelectItem
																key={sshKey.sshKeyId}
																value={sshKey.sshKeyId}
															>
																{sshKey.name}
															</SelectItem>
														))}
														<SelectItem value="none">
															{t("compose.none")}
														</SelectItem>
														<SelectLabel>
															{t("compose.keysCount", {
																count: sshKeys?.length ?? 0,
															})}
														</SelectLabel>
													</SelectGroup>
												</SelectContent>
											</Select>
										</FormControl>
									</FormItem>
								)}
							/>
						) : (
							<Button
								variant="secondary"
								onClick={() => router.push("/dashboard/settings/ssh-keys")}
								type="button"
							>
								<KeyRoundIcon className="size-4" /> {t("compose.addSshKey")}
							</Button>
						)}
					</div>
					<div className="space-y-4">
						<FormField
							control={form.control}
							name="branch"
							render={({ field }) => (
								<FormItem>
									<FormLabel>{t("compose.branch")}</FormLabel>
									<FormControl>
										<Input placeholder={t("compose.branch")} {...field} />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
					</div>

					<FormField
						control={form.control}
						name="composePath"
						render={({ field }) => (
							<FormItem>
								<FormLabel>{t("compose.composePath")}</FormLabel>
								<FormControl>
									<Input placeholder="docker-compose.yml" {...field} />
								</FormControl>

								<FormMessage />
							</FormItem>
						)}
					/>
					<FormField
						control={form.control}
						name="watchPaths"
						render={({ field }) => (
							<FormItem className="md:col-span-2">
								<div className="flex items-center gap-2">
									<FormLabel>{t("compose.watchPaths")}</FormLabel>
									<TooltipProvider>
										<Tooltip>
											<TooltipTrigger asChild>
												<HelpCircle className="size-4 text-muted-foreground hover:text-foreground transition-colors cursor-pointer" />
											</TooltipTrigger>
											<TooltipContent className="max-w-[300px]">
												<p>{t("compose.watchPathsTooltipWebhook")}</p>
											</TooltipContent>
										</Tooltip>
									</TooltipProvider>
								</div>
								<div className="flex flex-wrap gap-2 mb-2">
									{field.value?.map((path, index) => (
										<Badge key={index} variant="secondary">
											{path}
											<button
												type="button"
												aria-label={t("compose.removeWatchPath")}
												className="inline-flex items-center focus-visible:ring-2"
												onClick={() => {
													const newPaths = [...(field.value || [])];
													newPaths.splice(index, 1);
													form.setValue("watchPaths", newPaths);
												}}
											>
												<X className="ml-1 size-3 cursor-pointer" />
											</button>
										</Badge>
									))}
								</div>
								<FormControl>
									<div className="flex gap-2">
										<Input
											placeholder={t("compose.watchPathPlaceholder")}
											data-watch-path-input=""
											onKeyDown={(e) => {
												if (e.key === "Enter") {
													e.preventDefault();
													const input = e.currentTarget;
													const value = input.value.trim();
													if (value) {
														const newPaths = [...(field.value || []), value];
														form.setValue("watchPaths", newPaths);
														input.value = "";
													}
												}
											}}
										/>
										<Button
											type="button"
											variant="secondary"
											onClick={() => {
												const input = document.querySelector(
													"input[data-watch-path-input]",
												) as HTMLInputElement;
												const value = input.value.trim();
												if (value) {
													const newPaths = [...(field.value || []), value];
													form.setValue("watchPaths", newPaths);
													input.value = "";
												}
											}}
										>
											{t("compose.add")}{" "}
										</Button>
									</div>
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>
					<FormField
						control={form.control}
						name="enableSubmodules"
						render={({ field }) => (
							<FormItem className="flex flex-row items-center space-x-2 space-y-0">
								<FormControl>
									<Switch
										checked={field.value}
										onCheckedChange={field.onChange}
									/>
								</FormControl>
								<FormLabel>{t("compose.enableSubmodules")}</FormLabel>
							</FormItem>
						)}
					/>
				</div>

				<div className="flex flex-row justify-end">
					<Button type="submit" className="w-fit" isLoading={isPending}>
						{t("compose.save")}{" "}
					</Button>
				</div>
			</form>
		</Form>
	);
};

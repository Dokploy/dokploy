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
	buildPath: z.string().min(1, "application.git.pathRequired").default("/"),
	repositoryURL: z.string().min(1, {
		message: "application.git.repositoryUrlRequired",
	}),
	branch: z
		.string()
		.min(1, "application.git.branchRequired")
		.regex(VALID_BRANCH_REGEX, "application.git.invalidBranchName"),
	sshKey: z.string().optional(),
	watchPaths: z.array(z.string()).optional(),
	enableSubmodules: z.boolean().default(false),
});

type GitProvider = z.infer<typeof GitProviderSchema>;

interface Props {
	applicationId: string;
}

export const SaveGitProvider = ({ applicationId }: Props) => {
	const { t } = useTranslation();
	const { data, refetch } = api.application.one.useQuery({ applicationId });
	const { data: sshKeys } = api.sshKey.allForApps.useQuery();
	const router = useRouter();

	const { mutateAsync, isPending } =
		api.application.saveGitProvider.useMutation();

	const form = useForm({
		defaultValues: {
			branch: "",
			buildPath: "/",
			repositoryURL: "",
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
				buildPath: data.customGitBuildPath || "/",
				repositoryURL: data.customGitUrl || "",
				watchPaths: data.watchPaths || [],
				enableSubmodules: data.enableSubmodules ?? false,
			});
		}
	}, [form.reset, data, form]);

	const onSubmit = async (values: GitProvider) => {
		await mutateAsync({
			customGitBranch: values.branch,
			customGitBuildPath: values.buildPath,
			customGitUrl: values.repositoryURL,
			customGitSSHKeyId: values.sshKey === "none" ? null : values.sshKey,
			applicationId,
			watchPaths: values.watchPaths || [],
			enableSubmodules: values.enableSubmodules,
		})
			.then(async () => {
				toast.success(t("application.git.saved"));
				await refetch();
			})
			.catch(() => {
				toast.error(t("application.git.saveError"));
			});
	};

	return (
		<Form {...form}>
			<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
				<div className="grid grid-cols-2 lg:grid-cols-4 gap-4 items-start">
					<FormField
						control={form.control}
						name="repositoryURL"
						render={({ field }) => (
							<FormItem className="col-span-2 lg:col-span-3">
								<div className="flex items-center justify-between h-5">
									<FormLabel>{t("application.git.repositoryUrl")}</FormLabel>
									{field.value?.startsWith("https://") && (
										<Link
											href={field.value}
											target="_blank"
											rel="noopener noreferrer"
											className="flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"
										>
											<GitIcon className="h-4 w-4" />
											<span>{t("application.git.viewRepository")}</span>
										</Link>
									)}
								</div>
								<FormControl>
									<Input
										placeholder={t("application.git.repositoryUrl")}
										{...field}
									/>
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>
					{sshKeys && sshKeys.length > 0 ? (
						<FormField
							control={form.control}
							name="sshKey"
							render={({ field }) => (
								<FormItem className="col-span-2 lg:col-span-1">
									<FormLabel className="w-full inline-flex justify-between">
										{t("application.git.sshKey")}
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
												<SelectValue
													placeholder={t("application.git.selectKey")}
												/>
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
														{t("application.git.none")}
													</SelectItem>
													<SelectLabel>
														{t("application.git.keysCount", {
															amount: sshKeys?.length,
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
							className="col-span-2 lg:col-span-1 lg:mt-7"
						>
							<KeyRoundIcon className="size-4" />{" "}
							{t("application.git.addSshKey")}
						</Button>
					)}

					<FormField
						control={form.control}
						name="branch"
						render={({ field }) => (
							<FormItem className="col-span-2">
								<FormLabel>{t("application.git.branch")}</FormLabel>
								<FormControl>
									<Input placeholder={t("application.git.branch")} {...field} />
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>

					<FormField
						control={form.control}
						name="buildPath"
						render={({ field }) => (
							<FormItem className="col-span-2">
								<FormLabel>{t("application.git.buildPath")}</FormLabel>
								<FormControl>
									<Input placeholder="/" {...field} />
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>
					<FormField
						control={form.control}
						name="watchPaths"
						render={({ field }) => (
							<FormItem className="col-span-2 lg:col-span-4">
								<div className="flex items-center gap-2">
									<FormLabel>{t("application.git.watchPaths")}</FormLabel>
									<TooltipProvider>
										<Tooltip>
											<TooltipTrigger asChild>
												<HelpCircle className="size-4 text-muted-foreground hover:text-foreground transition-colors cursor-pointer" />
											</TooltipTrigger>
											<TooltipContent className="max-w-[300px]">
												<p>{t("application.git.watchPathsTooltip")}</p>
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
												aria-label={t("application.git.removeWatchPath")}
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
											placeholder={t("application.git.watchPathPlaceholder")}
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
													`input[placeholder="${t("application.git.watchPathPlaceholder")}"]`,
												) as HTMLInputElement;
												const value = input.value.trim();
												if (value) {
													const newPaths = [...(field.value || []), value];
													form.setValue("watchPaths", newPaths);
													input.value = "";
												}
											}}
										>
											{t("application.git.add")}
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
								<FormLabel>{t("application.git.enableSubmodules")}</FormLabel>
							</FormItem>
						)}
					/>
				</div>

				<div className="flex flex-row justify-end">
					<Button type="submit" className="w-fit" isLoading={isPending}>
						{t("application.git.save")}
					</Button>
				</div>
			</form>
		</Form>
	);
};

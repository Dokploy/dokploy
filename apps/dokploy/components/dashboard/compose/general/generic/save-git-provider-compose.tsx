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
import { zodResolver } from "@hookform/resolvers/zod";
import { KeyRoundIcon, LockIcon, X } from "lucide-react";
import { useTranslation } from "next-i18next";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const createGitProviderSchema = (t: any) =>
	z.object({
		composePath: z.string().min(1),
		repositoryURL: z.string().min(1, {
			message: t("dashboard.compose.repositoryURLRequired"),
		}),
		branch: z.string().min(1, t("dashboard.compose.branchRequired")),
		sshKey: z.string().optional(),
		watchPaths: z.array(z.string()).optional(),
		enableSubmodules: z.boolean().default(false),
	});

type GitProvider = z.infer<ReturnType<typeof createGitProviderSchema>>;

interface Props {
	composeId: string;
}

export const SaveGitProviderCompose = ({ composeId }: Props) => {
	const { t } = useTranslation("dashboard");
	const { data, refetch } = api.compose.one.useQuery({ composeId });
	const { data: sshKeys } = api.sshKey.all.useQuery();
	const router = useRouter();

	const { mutateAsync, isLoading } = api.compose.update.useMutation();

	const form = useForm<GitProvider>({
		defaultValues: {
			branch: "",
			repositoryURL: "",
			composePath: "./docker-compose.yml",
			sshKey: undefined,
			watchPaths: [],
			enableSubmodules: false,
		},
		resolver: zodResolver(createGitProviderSchema(t)),
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
			composeStatus: "idle",
			watchPaths: values.watchPaths || [],
			enableSubmodules: values.enableSubmodules,
		})
			.then(async () => {
				toast.success(t("dashboard.compose.gitProviderSaved"));
				await refetch();
			})
			.catch(() => {
				toast.error(t("dashboard.compose.errorSavingGitProvider"));
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
											<FormLabel>
												{t("dashboard.compose.repositoryURL")}
											</FormLabel>
											{field.value?.startsWith("https://") && (
												<Link
													href={field.value}
													target="_blank"
													rel="noopener noreferrer"
													className="flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"
												>
													<GitIcon className="h-4 w-4" />
													<span>{t("dashboard.compose.viewRepository")}</span>
												</Link>
											)}
										</div>
										<FormControl>
											<Input
												placeholder={t(
													"dashboard.compose.repositoryURLPlaceholder",
												)}
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
											{t("dashboard.compose.sshKey")}
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
														placeholder={t("dashboard.compose.selectAKey")}
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
															{t("dashboard.compose.none")}
														</SelectItem>
														<SelectLabel>
															{t("dashboard.compose.keys", {
																count: sshKeys?.length,
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
								<KeyRoundIcon className="size-4" />{" "}
								{t("dashboard.compose.addSSHKey")}
							</Button>
						)}
					</div>
					<div className="space-y-4">
						<FormField
							control={form.control}
							name="branch"
							render={({ field }) => (
								<FormItem>
									<FormLabel>{t("dashboard.compose.branch")}</FormLabel>
									<FormControl>
										<Input
											placeholder={t("dashboard.compose.branchPlaceholder")}
											{...field}
										/>
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
								<FormLabel>{t("dashboard.compose.composePath")}</FormLabel>
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
									<FormLabel>{t("dashboard.compose.watchPaths")}</FormLabel>
									<TooltipProvider>
										<Tooltip>
											<TooltipTrigger>
												<div className="size-4 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold">
													?
												</div>
											</TooltipTrigger>
											<TooltipContent className="max-w-[300px]">
												<p>{t("dashboard.compose.watchPathsTooltip")}</p>
											</TooltipContent>
										</Tooltip>
									</TooltipProvider>
								</div>
								<div className="flex flex-wrap gap-2 mb-2">
									{field.value?.map((path, index) => (
										<Badge key={index} variant="secondary">
											{path}
											<X
												className="ml-1 size-3 cursor-pointer"
												onClick={() => {
													const newPaths = [...(field.value || [])];
													newPaths.splice(index, 1);
													form.setValue("watchPaths", newPaths);
												}}
											/>
										</Badge>
									))}
								</div>
								<FormControl>
									<div className="flex gap-2">
										<Input
											placeholder={t(
												"dashboard.compose.watchPathsInputPlaceholder",
											)}
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
													`input[placeholder="${t(
														"dashboard.compose.watchPathsInputPlaceholder",
													)}"]`,
												) as HTMLInputElement;
												const value = input.value.trim();
												if (value) {
													const newPaths = [...(field.value || []), value];
													form.setValue("watchPaths", newPaths);
													input.value = "";
												}
											}}
										>
											{t("dashboard.compose.add")}
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
							<FormItem className="flex items-center space-x-2">
								<FormControl>
									<Switch
										checked={field.value}
										onCheckedChange={field.onChange}
									/>
								</FormControl>
								<FormLabel className="!mt-0">
									{t("dashboard.compose.enableSubmodules")}
								</FormLabel>
							</FormItem>
						)}
					/>
				</div>

				<div className="flex flex-row justify-end">
					<Button type="submit" className="w-fit" isLoading={isLoading}>
						{t("dashboard.compose.save")}{" "}
					</Button>
				</div>
			</form>
		</Form>
	);
};

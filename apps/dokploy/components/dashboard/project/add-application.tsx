import { zodResolver } from "@hookform/resolvers/zod";
import { Folder, HelpCircle } from "lucide-react";
import { useTranslation } from "next-i18next";
import { useState } from "react";
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
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
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
import { Textarea } from "@/components/ui/textarea";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { slugify } from "@/lib/slug";
import { api } from "@/utils/api";

const createAddApplicationSchema = (t: (key: string) => string) =>
	z.object({
		name: z.string().min(1, {
			message: t("service.validation.nameRequired"),
		}),
		appName: z
			.string()
			.min(1, {
				message: t("service.validation.appNameRequired"),
			})
			.regex(/^[a-z](?!.*--)([a-z0-9-]*[a-z])?$/, {
				message: t("service.validation.appNameInvalid"),
			}),
		description: z.string().optional(),
		serverId: z.string().optional(),
	});

type AddApplicationForm = z.infer<ReturnType<typeof createAddApplicationSchema>>;

interface Props {
	environmentId: string;
	projectName?: string;
}

export const AddApplication = ({ environmentId, projectName }: Props) => {
	const utils = api.useUtils();
	const { t } = useTranslation("common");
	const { data: isCloud } = api.settings.isCloud.useQuery();
	const [visible, setVisible] = useState(false);
	const slug = slugify(projectName);
	const { data: servers } = api.server.withSSHKey.useQuery();

	const hasServers = servers && servers.length > 0;
	// Show dropdown logic based on cloud environment
	// Cloud: show only if there are remote servers (no Dokploy option)
	// Self-hosted: show only if there are remote servers (Dokploy is default, hide if no remote servers)
	const shouldShowServerDropdown = hasServers;

	const { mutateAsync, isLoading, error, isError } =
		api.application.create.useMutation();

	const form = useForm<AddApplicationForm>({
		defaultValues: {
			name: "",
			appName: `${slug}-`,
			description: "",
		},
		resolver: zodResolver(createAddApplicationSchema(t)),
	});

	const onSubmit = async (data: AddApplicationForm) => {
		await mutateAsync({
			name: data.name,
			appName: data.appName,
			description: data.description,
			serverId: data.serverId === "dokploy" ? undefined : data.serverId,
			environmentId,
		})
			.then(async () => {
				toast.success(t("service.create.success"));
				form.reset();
				setVisible(false);
				await utils.environment.one.invalidate({
					environmentId,
				});
			})
			.catch(() => {
				toast.error(t("service.create.error"));
			});
	};

	return (
		<Dialog open={visible} onOpenChange={setVisible}>
			<DialogTrigger className="w-full">
				<DropdownMenuItem
					className="w-full cursor-pointer space-x-3"
					onSelect={(e) => e.preventDefault()}
				>
					<Folder className="size-4 text-muted-foreground" />
					<span>{t("service.type.application")}</span>
				</DropdownMenuItem>
			</DialogTrigger>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>{t("service.create")}</DialogTitle>
					<DialogDescription>
						{t("service.dialog.createApplicationDescription")}
					</DialogDescription>
				</DialogHeader>
				{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}
				<Form {...form}>
					<form
						id="hook-form"
						onSubmit={form.handleSubmit(onSubmit)}
						className="grid w-full gap-4"
					>
						<FormField
							control={form.control}
							name="name"
							render={({ field }) => (
								<FormItem>
									<FormLabel>{t("service.form.name")}</FormLabel>
									<FormControl>
										<Input
											placeholder={t("service.form.namePlaceholder")}
											{...field}
											onChange={(e) => {
												const val = e.target.value || "";
												const serviceName = slugify(val.trim());
												form.setValue("appName", `${slug}-${serviceName}`);
												field.onChange(val);
											}}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
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
														{t("service.form.serverLabel")}
														{!isCloud
															? ` ${t("service.form.serverOptionalSuffix")}`
															: ""}
														<HelpCircle className="size-4 text-muted-foreground" />
													</FormLabel>
												</TooltipTrigger>
												<TooltipContent
													className="z-[999] w-[300px]"
													align="start"
													side="top"
												>
													<span>
														{t("service.serverDropdown.description")}
													</span>
												</TooltipContent>
											</Tooltip>
										</TooltipProvider>

										<Select
											onValueChange={field.onChange}
											defaultValue={
												field.value || (!isCloud ? "dokploy" : undefined)
											}
										>
											<SelectTrigger>
												<SelectValue
													placeholder={
														!isCloud
															? t("services.filter.server.dokploy")
															: t("service.form.serverPlaceholder")
													}
												/>
											</SelectTrigger>
											<SelectContent>
												<SelectGroup>
													{!isCloud && (
														<SelectItem value="dokploy">
															<span className="flex items-center gap-2 justify-between w-full">
																<span>{t("services.filter.server.dokploy")}</span>
																<span className="text-muted-foreground text-xs self-center">
																	{t("service.form.defaultServerSuffix")}
																</span>
															</span>
														</SelectItem>
													)}
													{servers?.map((server) => (
														<SelectItem
															key={server.serverId}
															value={server.serverId}
														>
															<span className="flex items-center gap-2 justify-between w-full">
																<span>{server.name}</span>
																<span className="text-muted-foreground text-xs self-center">
																	{server.ipAddress}
																</span>
															</span>
														</SelectItem>
													))}
													<SelectLabel>
														{t("service.form.serversLabel", {
															count: servers?.length + (!isCloud ? 1 : 0),
														})}
													</SelectLabel>
												</SelectGroup>
											</SelectContent>
										</Select>
										<FormMessage />
									</FormItem>
								)}
							/>
						)}
						<FormField
							control={form.control}
							name="appName"
							render={({ field }) => (
								<FormItem>
									<FormLabel className="flex items-center gap-2">
										{t("service.form.appName")}
										<TooltipProvider delayDuration={0}>
											<Tooltip>
												<TooltipTrigger asChild>
													<HelpCircle className="size-4 text-muted-foreground" />
												</TooltipTrigger>
												<TooltipContent side="right">
													<p>{t("service.form.appNameTooltip")}</p>
												</TooltipContent>
											</Tooltip>
										</TooltipProvider>
									</FormLabel>
									<FormControl>
										<Input
											placeholder={t("service.form.appNamePlaceholder")}
											{...field}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="description"
							render={({ field }) => (
								<FormItem>
									<FormLabel>{t("service.form.description")}</FormLabel>
									<FormControl>
										<Textarea
											placeholder={t("service.form.descriptionPlaceholder")}
											className="resize-none"
											{...field}
										/>
									</FormControl>

									<FormMessage />
								</FormItem>
							)}
						/>
					</form>

					<DialogFooter>
						<Button isLoading={isLoading} form="hook-form" type="submit">
							{t("button.create")}
						</Button>
					</DialogFooter>
				</Form>
			</DialogContent>
		</Dialog>
	);
};

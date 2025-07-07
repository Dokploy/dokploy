import { zodResolver } from "@hookform/resolvers/zod";
import { CircuitBoard, HelpCircle } from "lucide-react";
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
import { zodResolver } from "@hookform/resolvers/zod";
import { CircuitBoard, HelpCircle } from "lucide-react";
import { type TFunction, useTranslation } from "next-i18next";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const AddComposeSchema = (t: TFunction) =>
	z.object({
		composeType: z.enum(["docker-compose", "stack"]).optional(),
		name: z.string().min(1, {
			message: t("dashboard.compose.nameRequired"),
		}),
		appName: z
			.string()
			.min(1, {
				message: t("dashboard.compose.appNameRequired"),
			})
			.regex(/^[a-z](?!.*--)([a-z0-9-]*[a-z])?$/, {
				message: t("dashboard.compose.appNameRegex"),
			}),
		description: z.string().optional(),
		serverId: z.string().optional(),
	});

type AddCompose = ReturnType<typeof AddComposeSchema>["_type"];

interface Props {
	projectId: string;
	projectName?: string;
}

export const AddCompose = ({ projectId, projectName }: Props) => {
	const { t } = useTranslation("dashboard");
	const utils = api.useUtils();
	const [visible, setVisible] = useState(false);
	const slug = slugify(projectName);
	const { data: isCloud } = api.settings.isCloud.useQuery();
	const { data: servers } = api.server.withSSHKey.useQuery();
	const { mutateAsync, isLoading, error, isError } =
		api.compose.create.useMutation();

	const hasServers = servers && servers.length > 0;

	const form = useForm<AddCompose>({
		defaultValues: {
			name: "",
			description: "",
			composeType: "docker-compose",
			appName: `${slug}-`,
		},
		resolver: zodResolver(AddComposeSchema(t)),
	});

	useEffect(() => {
		form.reset();
	}, [form, form.reset, form.formState.isSubmitSuccessful]);

	const onSubmit = async (data: AddCompose) => {
		await mutateAsync({
			name: data.name,
			description: data.description,
			projectId,
			composeType: data.composeType,
			appName: data.appName,
			serverId: data.serverId,
		})
			.then(async () => {
				toast.success(t("dashboard.compose.composeCreated"));
				setVisible(false);
				await utils.project.one.invalidate({
					projectId,
				});
			})
			.catch(() => {
				toast.error(t("dashboard.compose.errorCreatingCompose"));
			});
	};

	return (
		<Dialog open={visible} onOpenChange={setVisible}>
			<DialogTrigger className="w-full">
				<DropdownMenuItem
					className="w-full cursor-pointer space-x-3"
					onSelect={(e) => e.preventDefault()}
				>
					<CircuitBoard className="size-4 text-muted-foreground" />
					<span>{t("dashboard.compose.compose")}</span>
				</DropdownMenuItem>
			</DialogTrigger>
			<DialogContent className="sm:max-w-xl">
				<DialogHeader>
					<DialogTitle>{t("dashboard.compose.createCompose")}</DialogTitle>
					<DialogDescription>
						{t("dashboard.compose.assignNameAndDescription")}
					</DialogDescription>
				</DialogHeader>
				{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}

				<Form {...form}>
					<form
						id="hook-form"
						onSubmit={form.handleSubmit(onSubmit)}
						className="grid w-full gap-4"
					>
						<div className="flex flex-col gap-4">
							<FormField
								control={form.control}
								name="name"
								render={({ field }) => (
									<FormItem>
										<FormLabel>{t("dashboard.compose.name")}</FormLabel>
										<FormControl>
											<Input
												placeholder={t("dashboard.compose.namePlaceholder")}
												{...field}
												onChange={(e) => {
													const val = e.target.value?.trim() || "";
													const serviceName = slugify(val);
													form.setValue("appName", `${slug}-${serviceName}`);
													field.onChange(val);
												}}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
						</div>
						{hasServers && (
							<><FormField
								control={form.control}
								name="serverId"
								render={({ field }) => (
									<FormItem>
										<TooltipProvider delayDuration={0}>
											<Tooltip>
												<TooltipTrigger asChild>
													<FormLabel className="break-all w-fit flex flex-row gap-1 items-center">
														{!isCloud
															? t("dashboard.compose.selectServerOptional")
															: t("dashboard.compose.selectServer")}
														<HelpCircle className="size-4 text-muted-foreground" />
													</FormLabel>
												</TooltipTrigger>
												<TooltipContent
													className="z-[999] w-[300px]"
													align="start"
													side="top"
												>
													<span>{t("dashboard.compose.serverTooltip")}</span>
												</TooltipContent>
											</Tooltip>
										</TooltipProvider>

										<Select
											onValueChange={field.onChange}
											defaultValue={field.value}
										>
											<SelectTrigger>
												<SelectValue
													placeholder={t(
														"dashboard.compose.selectServerPlaceholder"
													)} />
											</SelectTrigger>
											<SelectContent>
												<SelectGroup>
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
														{t("dashboard.compose.servers")} ({servers?.length})
													</SelectLabel>
												</SelectGroup>
											</SelectContent>
										</Select>
										<FormMessage />
									</FormItem>
								)} /><FormField
									control={form.control}
									name="appName"
									render={({ field }) => (
										<FormItem>
											<FormLabel>{t("dashboard.compose.appName")}</FormLabel>
											<FormControl>
												<Input
													placeholder={t("dashboard.compose.appNamePlaceholder")}
													{...field} />
											</FormControl>
											<FormMessage />
										</FormItem>
									)} /><FormField
									control={form.control}
									name="composeType"
									render={({ field }) => (
										<FormItem>
											<FormLabel>{t("dashboard.compose.composeType")}</FormLabel>
											<Select
												onValueChange={field.onChange}
												defaultValue={field.value}
											>
												<FormControl>
													<SelectTrigger>
														<SelectValue
															placeholder={t("dashboard.compose.selectComposeType")} />
													</SelectTrigger>
												</FormControl>
												<SelectContent>
													<SelectItem value="docker-compose">
														{t("dashboard.compose.dockerCompose")}
													</SelectItem>
													<SelectItem value="stack">
														{t("dashboard.compose.stack")}
													</SelectItem>
												</SelectContent>
											</Select>
											<FormMessage />
										</FormItem>
									)} /><FormField
									control={form.control}
									name="description"
									render={({ field }) => (
										<FormItem>
											<FormLabel>{t("dashboard.compose.description")}</FormLabel>
											<FormControl>
												<Textarea
													placeholder={t(
														"dashboard.compose.descriptionPlaceholder"
													)}
													className="resize-none"
													{...field} />
											</FormControl>

											<FormMessage />
										</FormItem>
									)} /></>
					</form>

					<DialogFooter>
						<Button isLoading={isLoading} form="hook-form" type="submit">
							{t("dashboard.compose.create")}
						</Button>
					</DialogFooter>
				</Form>
			</DialogContent>
		</Dialog>
	);
};

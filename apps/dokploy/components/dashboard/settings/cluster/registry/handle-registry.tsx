import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, PenBoxIcon, PlusIcon } from "lucide-react";
import { useTranslation } from "next-i18next";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
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
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { api } from "@/utils/api";

const addRegistryBaseSchema = z.object({
	registryName: z.string(),
	username: z.string(),
	password: z.string(),
	registryUrl: z.string(),
	imagePrefix: z.string(),
	serverId: z.string().optional(),
});

const createAddRegistrySchema = (t: (key: string) => string) =>
	addRegistryBaseSchema.extend({
		registryName: addRegistryBaseSchema.shape.registryName.min(1, {
			message: t("settings.registry.validation.registryNameRequired"),
		}),
		username: addRegistryBaseSchema.shape.username.min(1, {
			message: t("settings.registry.validation.usernameRequired"),
		}),
		password: addRegistryBaseSchema.shape.password.min(1, {
			message: t("settings.registry.validation.passwordRequired"),
		}),
	});

type AddRegistry = z.infer<typeof addRegistryBaseSchema>;

interface Props {
	registryId?: string;
}

export const HandleRegistry = ({ registryId }: Props) => {
	const { t } = useTranslation("settings");
	const defaultRegistryName = t("settings.registry.form.defaultName");
	const utils = api.useUtils();
	const [isOpen, setIsOpen] = useState(false);

	const { data: registry } = api.registry.one.useQuery(
		{
			registryId: registryId || "",
		},
		{
			enabled: !!registryId,
		},
	);

	const { data: isCloud } = api.settings.isCloud.useQuery();

	const { mutateAsync, error, isError } = registryId
		? api.registry.update.useMutation()
		: api.registry.create.useMutation();
	const { data: servers } = api.server.withSSHKey.useQuery();
	const {
		mutateAsync: testRegistry,
		isLoading,
		error: testRegistryError,
		isError: testRegistryIsError,
	} = api.registry.testRegistry.useMutation();
	const schema = useMemo(() => createAddRegistrySchema(t), [t]);
	const form = useForm<AddRegistry>({
		defaultValues: {
			username: "",
			password: "",
			registryUrl: "",
			imagePrefix: "",
			registryName: "",
			serverId: "",
		},
		resolver: zodResolver(schema),
	});

	const password = form.watch("password");
	const username = form.watch("username");
	const registryUrl = form.watch("registryUrl");
	const registryName = form.watch("registryName");
	const imagePrefix = form.watch("imagePrefix");
	const serverId = form.watch("serverId");

	useEffect(() => {
		if (registry) {
			form.reset({
				username: registry.username,
				password: "",
				registryUrl: registry.registryUrl,
				imagePrefix: registry.imagePrefix || "",
				registryName: registry.registryName,
			});
		} else {
			form.reset({
				username: "",
				password: "",
				registryUrl: "",
				imagePrefix: "",
				serverId: "",
			});
		}
	}, [form, form.reset, form.formState.isSubmitSuccessful, registry]);

	const onSubmit = async (data: AddRegistry) => {
		await mutateAsync({
			password: data.password,
			registryName: data.registryName,
			username: data.username,
			registryUrl: data.registryUrl,
			registryType: "cloud",
			imagePrefix: data.imagePrefix,
			serverId: data.serverId,
			registryId: registryId || "",
		})
			.then(async (_data) => {
				await utils.registry.all.invalidate();
				toast.success(
					registryId
						? t("settings.registry.form.updateSuccess")
						: t("settings.registry.form.createSuccess"),
				);
				setIsOpen(false);
			})
			.catch(() => {
				toast.error(
					registryId
						? t("settings.registry.form.updateError")
						: t("settings.registry.form.createError"),
				);
			});
	};

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				{registryId ? (
					<Button
						variant="ghost"
						size="icon"
						className="group hover:bg-blue-500/10 "
					>
						<PenBoxIcon className="size-3.5  text-primary group-hover:text-blue-500" />
					</Button>
				) : (
					<Button className="cursor-pointer space-x-3">
						<PlusIcon className="h-4 w-4" />
						{t("settings.registry.form.addButton")}
					</Button>
				)}
			</DialogTrigger>
			<DialogContent className="sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>{t("settings.registry.form.title")}</DialogTitle>
					<DialogDescription>
						{t("settings.registry.form.description")}
					</DialogDescription>
				</DialogHeader>
				{(isError || testRegistryIsError) && (
					<div className="flex flex-row gap-4 rounded-lg bg-red-50 p-2 dark:bg-red-950">
						<AlertTriangle className="text-red-600 dark:text-red-400" />
						<span className="text-sm text-red-600 dark:text-red-400">
							{testRegistryError?.message || error?.message || ""}
						</span>
					</div>
				)}
				<Form {...form}>
					<form
						onSubmit={form.handleSubmit(onSubmit)}
						className="grid grid-cols-1 sm:grid-cols-2 w-full gap-4"
					>
						<div className="flex flex-col gap-4">
							<FormField
								control={form.control}
								name="registryName"
								render={({ field }) => (
									<FormItem>
										<FormLabel>{t("settings.registry.form.name")}</FormLabel>
										<FormControl>
											<Input
												placeholder={t(
													"settings.registry.form.namePlaceholder",
												)}
												{...field}
											/>
										</FormControl>

										<FormMessage />
									</FormItem>
								)}
							/>
						</div>
						<div className="flex flex-col gap-4">
							<FormField
								control={form.control}
								name="username"
								render={({ field }) => (
									<FormItem>
										<FormLabel>{t("settings.registry.form.username")}</FormLabel>
										<FormControl>
											<Input
												placeholder={t(
													"settings.registry.form.usernamePlaceholder",
												)}
												autoComplete="username"
												{...field}
											/>
										</FormControl>

										<FormMessage />
									</FormItem>
								)}
							/>
						</div>
						<div className="flex flex-col gap-4">
							<FormField
								control={form.control}
								name="password"
								render={({ field }) => (
									<FormItem>
										<FormLabel>{t("settings.registry.form.password")}</FormLabel>
										<FormControl>
											<Input
												placeholder={t(
													"settings.registry.form.passwordPlaceholder",
												)}
												autoComplete="one-time-code"
												{...field}
												type="password"
											/>
										</FormControl>

										<FormMessage />
									</FormItem>
								)}
							/>
						</div>
						<div className="flex flex-col gap-4">
							<FormField
								control={form.control}
								name="imagePrefix"
								render={({ field }) => (
									<FormItem>
										<FormLabel>{t("settings.registry.form.imagePrefix")}</FormLabel>
										<FormControl>
											<Input
												{...field}
												placeholder={t(
													"settings.registry.form.imagePrefixPlaceholder",
												)}
											/>
										</FormControl>

										<FormMessage />
									</FormItem>
								)}
							/>
						</div>
						<div className="flex flex-col gap-4  col-span-2">
							<FormField
								control={form.control}
								name="registryUrl"
								render={({ field }) => (
									<FormItem>
										<FormLabel>{t("settings.registry.form.registryUrl")}</FormLabel>
										<FormControl>
											<Input
												placeholder={t(
													"settings.registry.form.registryUrlPlaceholder",
												)}
												{...field}
											/>
										</FormControl>

										<FormMessage />
									</FormItem>
								)}
							/>
						</div>

						<div className="col-span-2">
							<FormField
								control={form.control}
								name="serverId"
								render={({ field }) => (
									<FormItem>
										<FormLabel>
											{isCloud
												? t("settings.registry.form.server.label")
												: t("settings.registry.form.server.labelOptional")}
										</FormLabel>
										<FormDescription>
											{t("settings.registry.form.server.description")}
										</FormDescription>
										<FormControl>
											<Select
												onValueChange={field.onChange}
												defaultValue={field.value}
											>
												<SelectTrigger className="w-full">
													<SelectValue
														placeholder={t(
															"settings.registry.form.server.placeholder",
														)}
													/>
												</SelectTrigger>
												<SelectContent>
													<SelectGroup>
														<SelectLabel>
															{t("settings.registry.form.server.groupLabel")}
														</SelectLabel>
														{servers?.map((server) => (
															<SelectItem
																key={server.serverId}
																value={server.serverId}
															>
																{server.name}
															</SelectItem>
														))}
														<SelectItem value={"none"}>
															{t("settings.registry.form.server.none")}
														</SelectItem>
													</SelectGroup>
												</SelectContent>
											</Select>
										</FormControl>

										<FormMessage />
									</FormItem>
								)}
							/>
						</div>

						<DialogFooter className="flex flex-col w-full sm:justify-between gap-4 flex-wrap sm:flex-col col-span-2">
							<div className="flex flex-row gap-2 justify-between">
								<Button
									type="button"
									variant={"secondary"}
									isLoading={isLoading}
									onClick={async () => {
										const validationResult = schema.safeParse({
											username,
											password,
											registryUrl,
										registryName: registryName || defaultRegistryName,
											imagePrefix,
											serverId,
										});

										if (!validationResult.success) {
											for (const issue of validationResult.error.issues) {
												form.setError(issue.path[0] as any, {
													type: "manual",
													message: issue.message,
												});
											}
											return;
										}

										await testRegistry({
											username: username,
											password: password,
											registryUrl: registryUrl,
											registryName: registryName || defaultRegistryName,
											registryType: "cloud",
											imagePrefix: imagePrefix,
											serverId: serverId,
										})
											.then((data) => {
												if (data) {
													toast.success(
														"" + t("settings.registry.form.testSuccess"),
													);
												} else {
													toast.error(
														"" + t("settings.registry.form.testFailed"),
													);
												}
											})
											.catch(() => {
												toast.error(
													"" + t("settings.registry.form.testError"),
												);
											});
									}}
								>
									{t("settings.registry.form.test")}
								</Button>
								<Button isLoading={form.formState.isSubmitting} type="submit">
									{registryId
										? t("settings.common.update")
										: t("settings.common.create")}
								</Button>
							</div>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
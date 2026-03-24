import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { PlusIcon } from "lucide-react";
import type React from "react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { AlertBlock } from "@/components/shared/alert-block";
import { CodeEditor } from "@/components/shared/code-editor";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";
import { api } from "@/utils/api";

interface Props {
	serviceId: string;
	serviceType:
		| "application"
		| "postgres"
		| "redis"
		| "mongo"
		| "redis"
		| "mysql"
		| "mariadb"
		| "compose";
	refetch: () => void;
	children?: React.ReactNode;
}

export const AddVolumes = ({
	serviceId,
	serviceType,
	refetch,
	children = <PlusIcon className="h-4 w-4" />,
}: Props) => {
	const t = useTranslations("applicationAdvancedVolumes.add");
	const tCommon = useTranslations("common");
	const [isOpen, setIsOpen] = useState(false);
	const { mutateAsync } = api.mounts.create.useMutation();

	const mountSchema = useMemo(
		() =>
			z.object({
				mountPath: z.string().min(1, t("validation.mountPath")),
			}),
		[t],
	);

	const mySchema = useMemo(
		() =>
			z.discriminatedUnion("type", [
				z
					.object({
						type: z.literal("bind"),
						hostPath: z.string().min(1, t("validation.hostPath")),
					})
					.merge(mountSchema),
				z
					.object({
						type: z.literal("volume"),
						volumeName: z
							.string()
							.min(1, t("validation.volumeName"))
							.regex(
								/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/,
								t("validation.volumeNameInvalid"),
							),
					})
					.merge(mountSchema),
				z
					.object({
						type: z.literal("file"),
						filePath: z.string().min(1, t("validation.filePath")),
						content: z.string().optional(),
					})
					.merge(mountSchema),
			]),
		[t, mountSchema],
	);

	type AddMount = z.infer<typeof mySchema>;

	const form = useForm<AddMount>({
		defaultValues: {
			type: serviceType === "compose" ? "file" : "bind",
			hostPath: "",
			mountPath: serviceType === "compose" ? "/" : "",
		},
		resolver: zodResolver(mySchema),
	});
	const type = form.watch("type");

	useEffect(() => {
		form.reset();
	}, [form, form.reset, form.formState.isSubmitSuccessful]);

	const onSubmit = async (data: AddMount) => {
		if (data.type === "bind") {
			await mutateAsync({
				serviceId,
				hostPath: data.hostPath,
				mountPath: data.mountPath,
				type: data.type,
				serviceType,
			})
				.then(() => {
					toast.success(t("toast.created"));
					setIsOpen(false);
				})
				.catch(() => {
					toast.error(t("toast.errorBind"));
				});
		} else if (data.type === "volume") {
			await mutateAsync({
				serviceId,
				volumeName: data.volumeName,
				mountPath: data.mountPath,
				type: data.type,
				serviceType,
			})
				.then(() => {
					toast.success(t("toast.created"));
					setIsOpen(false);
				})
				.catch(() => {
					toast.error(t("toast.errorVolume"));
				});
		} else if (data.type === "file") {
			await mutateAsync({
				serviceId,
				content: data.content,
				mountPath: data.mountPath,
				filePath: data.filePath,
				type: data.type,
				serviceType,
			})
				.then(() => {
					toast.success(t("toast.created"));
					setIsOpen(false);
				})
				.catch(() => {
					toast.error(t("toast.errorFile"));
				});
		}

		refetch();
	};

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger className="" asChild>
				<Button>{children}</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-3xl">
				<DialogHeader>
					<DialogTitle>{t("dialogTitle")}</DialogTitle>
				</DialogHeader>

				<Form {...form}>
					<form
						id="hook-form-volume"
						onSubmit={form.handleSubmit(onSubmit)}
						className="grid w-full gap-8 "
					>
						{type === "bind" && (
							<AlertBlock>
								<div className="space-y-2">
									<p>{t("alertBind")}</p>
									<p className="text-sm text-muted-foreground">
										<strong>{t("clusterWarning")}</strong> {t("alertCluster")}
									</p>
								</div>
							</AlertBlock>
						)}
						<FormField
							control={form.control}
							defaultValue={form.control._defaultValues.type}
							name="type"
							render={({ field }) => (
								<FormItem className="space-y-3">
									<FormLabel className="text-muted-foreground">
										{t("mountTypeLabel")}
									</FormLabel>
									<FormControl>
										<RadioGroup
											onValueChange={field.onChange}
											defaultValue={field.value}
											className="grid w-full grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4"
										>
											{serviceType !== "compose" && (
												<FormItem className="flex items-center space-x-3 space-y-0">
													<FormControl className="w-full">
														<div>
															<RadioGroupItem
																value="bind"
																id="bind"
																className="peer sr-only"
															/>
															<Label
																htmlFor="bind"
																className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer"
															>
																{t("bindMount")}
															</Label>
														</div>
													</FormControl>
												</FormItem>
											)}

											{serviceType !== "compose" && (
												<FormItem className="flex items-center space-x-3 space-y-0">
													<FormControl className="w-full">
														<div>
															<RadioGroupItem
																value="volume"
																id="volume"
																className="peer sr-only"
															/>
															<Label
																htmlFor="volume"
																className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer"
															>
																{t("volumeMount")}
															</Label>
														</div>
													</FormControl>
												</FormItem>
											)}

											<FormItem
												className={cn(
													serviceType === "compose" && "col-span-3",
													"flex items-center space-x-3 space-y-0",
												)}
											>
												<FormControl className="w-full">
													<div>
														<RadioGroupItem
															value="file"
															id="file"
															className="peer sr-only"
														/>
														<Label
															htmlFor="file"
															className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer"
														>
															{t("fileMount")}
														</Label>
													</div>
												</FormControl>
											</FormItem>
										</RadioGroup>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<div className="flex flex-col gap-4">
							<FormLabel className="text-lg font-semibold leading-none tracking-tight">
								{t("fillFields")}
							</FormLabel>
							<div className="flex flex-col gap-2">
								{type === "bind" && (
									<FormField
										control={form.control}
										name="hostPath"
										render={({ field }) => (
											<FormItem>
												<FormLabel>{t("hostPath")}</FormLabel>
												<FormControl>
													<Input placeholder={t("placeholderHost")} {...field} />
												</FormControl>

												<FormMessage />
											</FormItem>
										)}
									/>
								)}
								{type === "volume" && (
									<FormField
										control={form.control}
										name="volumeName"
										render={({ field }) => (
											<FormItem>
												<FormLabel>{t("volumeName")}</FormLabel>
												<FormControl>
													<Input
														placeholder={t("placeholderVolume")}
														{...field}
														value={field.value || ""}
													/>
												</FormControl>
												<FormMessage />
											</FormItem>
										)}
									/>
								)}

								{type === "file" && (
									<>
										<FormField
											control={form.control}
											name="content"
											render={({ field }) => (
												<FormItem className="max-w-full max-w-[45rem]">
													<FormLabel>{t("content")}</FormLabel>
													<FormControl>
														<FormControl>
															<CodeEditor
																language="properties"
																placeholder={`NODE_ENV=production
PORT=3000
`}
																className="h-96 font-mono "
																{...field}
															/>
														</FormControl>
													</FormControl>
													<FormMessage />
												</FormItem>
											)}
										/>
										<FormField
											control={form.control}
											name="filePath"
											render={({ field }) => (
												<FormItem>
													<FormLabel>{t("filePath")}</FormLabel>
													<FormControl>
														<FormControl>
															<Input
																placeholder={t("filePathPlaceholder")}
																{...field}
															/>
														</FormControl>
													</FormControl>
													<FormMessage />
												</FormItem>
											)}
										/>
									</>
								)}
								{serviceType !== "compose" && (
									<FormField
										control={form.control}
										name="mountPath"
										render={({ field }) => (
											<FormItem>
												<FormLabel>{t("mountPath")}</FormLabel>
												<FormControl>
													<Input placeholder={t("placeholderMount")} {...field} />
												</FormControl>

												<FormMessage />
											</FormItem>
										)}
									/>
								)}
							</div>
						</div>
					</form>

					<DialogFooter>
						<Button
							isLoading={form.formState.isSubmitting}
							form="hook-form-volume"
							type="submit"
						>
							{tCommon("create")}
						</Button>
					</DialogFooter>
				</Form>
			</DialogContent>
		</Dialog>
	);
};

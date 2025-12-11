import { zodResolver } from "@hookform/resolvers/zod";
import { PlusIcon } from "lucide-react";
import { useTranslation } from "next-i18next";
import type React from "react";
import { useEffect, useState } from "react";
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

const mountSchema = (t: (key: string) => string) =>
	z.object({
		mountPath: z
			.string()
			.min(1, t("volumes.validation.mountPathRequired")),
	});

const createSchema = (t: (key: string) => string) =>
	z.discriminatedUnion("type", [
		z
			.object({
				type: z.literal("bind"),
				hostPath: z
					.string()
					.min(1, t("volumes.validation.hostPathRequired")),
			})
			.merge(mountSchema(t)),
		z
			.object({
				type: z.literal("volume"),
				volumeName: z
					.string()
					.min(1, t("volumes.validation.volumeNameRequired"))
					.regex(
						/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/,
						t("volumes.validation.volumeNameInvalid"),
					),
			})
			.merge(mountSchema(t)),
		z
			.object({
				type: z.literal("file"),
				filePath: z
					.string()
					.min(1, t("volumes.validation.filePathRequired")),
				content: z.string().optional(),
			})
			.merge(mountSchema(t)),
	]);

type AddMount = z.infer<ReturnType<typeof createSchema>>;

export const AddVolumes = ({
	serviceId,
	serviceType,
	refetch,
	children = <PlusIcon className="h-4 w-4" />,
}: Props) => {
	const { t } = useTranslation("common");
	const [isOpen, setIsOpen] = useState(false);
	const { mutateAsync } = api.mounts.create.useMutation();
	const mySchema = createSchema(t);
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
					toast.success(t("volumes.toast.mountCreated"));
					setIsOpen(false);
				})
				.catch(() => {
					toast.error(t("volumes.toast.errorCreateBind"));
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
					toast.success(t("volumes.toast.mountCreated"));
					setIsOpen(false);
				})
				.catch(() => {
					toast.error(t("volumes.toast.errorCreateVolume"));
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
					toast.success(t("volumes.toast.mountCreated"));
					setIsOpen(false);
				})
				.catch(() => {
					toast.error(t("volumes.toast.errorCreateFile"));
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
					<DialogTitle>{t("volumes.dialog.title")}</DialogTitle>
				</DialogHeader>
				{/* {isError && (
        <div className="flex items-center flex-row gap-4 rounded-lg bg-red-50 p-2 dark:bg-red-950">
          <AlertTriangle className="text-red-600 dark:text-red-400" />
          <span className="text-sm text-red-600 dark:text-red-400">
            {error?.message}
          </span>
        </div>
      )} */}

				<Form {...form}>
					<form
						id="hook-form-volume"
						onSubmit={form.handleSubmit(onSubmit)}
						className="grid w-full gap-8 "
					>
						{type === "bind" && (
							<AlertBlock>
								<div className="space-y-2">
									<p>
										{t("volumes.alert.bindHostPath")}
									</p>
									<p className="text-sm text-muted-foreground">
										<strong>{t("volumes.alert.clusterWarningTitle")}</strong>
										{t("volumes.alert.clusterWarningBody")}
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
										{t("volumes.form.typeLabel")}
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
																{t("volumes.form.type.bind")}
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
																{t("volumes.form.type.volume")}
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
															{t("volumes.form.type.file")}
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
								{t("volumes.form.fieldsTitle")}
							</FormLabel>
							<div className="flex flex-col gap-2">
								{type === "bind" && (
									<FormField
										control={form.control}
										name="hostPath"
										render={({ field }) => (
											<FormItem>
												<FormLabel>{t("volumes.form.hostPathLabel")}</FormLabel>
												<FormControl>
													<Input
														placeholder={t("volumes.form.hostPathPlaceholder")}
														{...field}
													/>
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
												<FormLabel>{t("volumes.form.volumeNameLabel")}</FormLabel>
												<FormControl>
													<Input
														placeholder={t("volumes.form.volumeNamePlaceholder")}
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
													<FormLabel>{t("volumes.form.contentLabel")}</FormLabel>
													<FormControl>
														<FormControl>
															<CodeEditor
																language="properties"
																placeholder={t("volumes.form.contentPlaceholder")}
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
													<FormLabel>{t("volumes.form.filePathLabel")}</FormLabel>
													<FormControl>
														<FormControl>
															<Input
																placeholder={t("volumes.form.filePathPlaceholder")}
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
												<FormLabel>{t("volumes.form.mountPathLabel")}</FormLabel>
												<FormControl>
													<Input
														placeholder={t("volumes.form.mountPathPlaceholder")}
														{...field}
													/>
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
							{t("volumes.form.submit.create")}
						</Button>
					</DialogFooter>
				</Form>
			</DialogContent>
		</Dialog>
	);
};

import { zodResolver } from "@hookform/resolvers/zod";
import { PenBoxIcon } from "lucide-react";
import { useTranslation } from "next-i18next";
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
	DialogDescription,
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
import { api } from "@/utils/api";

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
				content: z.string().optional(),
				filePath: z
					.string()
					.min(1, t("volumes.validation.filePathRequired")),
			})
			.merge(mountSchema(t)),
	]);

type UpdateMount = z.infer<ReturnType<typeof createSchema>>;

interface Props {
	mountId: string;
	type: "bind" | "volume" | "file";
	refetch: () => void;
	serviceType:
		| "application"
		| "postgres"
		| "redis"
		| "mongo"
		| "redis"
		| "mysql"
		| "mariadb"
		| "compose";
}

export const UpdateVolume = ({
	mountId,
	type,
	refetch,
	serviceType,
}: Props) => {
	const { t } = useTranslation("common");
	const [isOpen, setIsOpen] = useState(false);
	const _utils = api.useUtils();
	const mySchema = createSchema(t);
	const { data } = api.mounts.one.useQuery(
		{
			mountId,
		},
		{
			enabled: !!mountId,
		},
	);

	const { mutateAsync, isLoading, error, isError } =
		api.mounts.update.useMutation();

	const form = useForm<UpdateMount>({
		defaultValues: {
			type,
			hostPath: "",
			mountPath: "",
		},
		resolver: zodResolver(mySchema),
	});

	const typeForm = form.watch("type");

	useEffect(() => {
		if (data) {
			if (typeForm === "bind") {
				form.reset({
					hostPath: data.hostPath || "",
					mountPath: data.mountPath,
					type: "bind",
				});
			} else if (typeForm === "volume") {
				form.reset({
					volumeName: data.volumeName || "",
					mountPath: data.mountPath,
					type: "volume",
				});
			} else if (typeForm === "file") {
				form.reset({
					content: data.content || "",
					mountPath: serviceType === "compose" ? "/" : data.mountPath,
					filePath: data.filePath || "",
					type: "file",
				});
			}
		}
	}, [form, form.reset, data]);

	const onSubmit = async (data: UpdateMount) => {
		if (data.type === "bind") {
			await mutateAsync({
				hostPath: data.hostPath,
				mountPath: data.mountPath,
				type: data.type,
				mountId,
			})
				.then(() => {
					toast.success(t("volumes.toast.mountUpdated"));
					setIsOpen(false);
				})
				.catch(() => {
					toast.error(t("volumes.toast.errorUpdateBind"));
				});
		} else if (data.type === "volume") {
			await mutateAsync({
				volumeName: data.volumeName,
				mountPath: data.mountPath,
				type: data.type,
				mountId,
			})
				.then(() => {
					toast.success(t("volumes.toast.mountUpdated"));
					setIsOpen(false);
				})
				.catch(() => {
					toast.error(t("volumes.toast.errorUpdateVolume"));
				});
		} else if (data.type === "file") {
			await mutateAsync({
				content: data.content,
				mountPath: data.mountPath,
				type: data.type,
				filePath: data.filePath,
				mountId,
			})
				.then(() => {
					toast.success(t("volumes.toast.mountUpdated"));
					setIsOpen(false);
				})
				.catch(() => {
					toast.error(t("volumes.toast.errorUpdateFile"));
				});
		}
		refetch();
	};

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					className="group hover:bg-blue-500/10 "
					isLoading={isLoading}
				>
					<PenBoxIcon className="size-3.5  text-primary group-hover:text-blue-500" />
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-3xl">
				<DialogHeader>
					<DialogTitle>{t("volumes.dialog.updateTitle")}</DialogTitle>
					<DialogDescription>
						{t("volumes.dialog.updateDescription")}
					</DialogDescription>
				</DialogHeader>
				{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}
				{type === "file" && (
					<AlertBlock type="warning">
						{t("volumes.alert.updateFileWarning")}
					</AlertBlock>
				)}

				<Form {...form}>
					<form
						id="hook-form-update-volume"
						onSubmit={form.handleSubmit(onSubmit)}
						className="grid w-full gap-4"
					>
						<div className="flex flex-col gap-4">
							{type === "bind" && (
								<FormField
									control={form.control}
									name="hostPath"
									render={({ field }) => (
										<FormItem>
											<FormLabel>{t("volumes.form.hostPathLabel")}</FormLabel>
											<FormLabel>{t("volumes.form.hostPathDescription")}</FormLabel>
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
															className="h-96 font-mono w-full"
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
													<Input
														disabled
														placeholder={t("volumes.form.filePathPlaceholder")}
														{...field}
													/>
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
						<DialogFooter>
							<Button isLoading={isLoading} type="submit">
								{t("volumes.form.submit.update")}
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
};

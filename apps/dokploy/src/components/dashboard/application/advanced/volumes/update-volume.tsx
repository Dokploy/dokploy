import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { PenBoxIcon } from "lucide-react";
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
	const t = useTranslations("applicationAdvancedVolumes.update");
	const tCommon = useTranslations("common");
	const [isOpen, setIsOpen] = useState(false);
	const _utils = api.useUtils();
	const { data } = api.mounts.one.useQuery(
		{
			mountId,
		},
		{
			enabled: !!mountId,
		},
	);

	const { mutateAsync, isPending, error, isError } =
		api.mounts.update.useMutation();

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
						content: z.string().optional(),
						filePath: z.string().min(1, t("validation.filePath")),
					})
					.merge(mountSchema),
			]),
		[t, mountSchema],
	);

	type UpdateMount = z.infer<typeof mySchema>;

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

	const onSubmit = async (submitData: UpdateMount) => {
		if (submitData.type === "bind") {
			await mutateAsync({
				hostPath: submitData.hostPath,
				mountPath: submitData.mountPath,
				type: submitData.type,
				mountId,
			})
				.then(() => {
					toast.success(t("toast.success"));
					setIsOpen(false);
				})
				.catch(() => {
					toast.error(t("toast.errorBind"));
				});
		} else if (submitData.type === "volume") {
			await mutateAsync({
				volumeName: submitData.volumeName,
				mountPath: submitData.mountPath,
				type: submitData.type,
				mountId,
			})
				.then(() => {
					toast.success(t("toast.success"));
					setIsOpen(false);
				})
				.catch(() => {
					toast.error(t("toast.errorVolume"));
				});
		} else if (submitData.type === "file") {
			await mutateAsync({
				content: submitData.content,
				mountPath: submitData.mountPath,
				type: submitData.type,
				filePath: submitData.filePath,
				mountId,
			})
				.then(() => {
					toast.success(t("toast.success"));
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
			<DialogTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					className="group hover:bg-blue-500/10 "
					isLoading={isPending}
				>
					<PenBoxIcon className="size-3.5  text-primary group-hover:text-blue-500" />
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-3xl">
				<DialogHeader>
					<DialogTitle>{t("title")}</DialogTitle>
					<DialogDescription>{t("description")}</DialogDescription>
				</DialogHeader>
				{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}
				{type === "file" && (
					<AlertBlock type="warning">{t("alertFile")}</AlertBlock>
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
												<FormLabel>{t("filePath")}</FormLabel>
												<FormControl>
													<Input
														disabled
														placeholder={t("placeholderFileName")}
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
						<DialogFooter>
							<Button isLoading={isPending} type="submit">
								{tCommon("save")}
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
};

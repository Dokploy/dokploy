import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { PenBoxIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
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

const mountSchema = z.object({
	mountPath: z.string().min(1, "application.volumes.mountPathRequired"),
});

const mySchema = z.discriminatedUnion("type", [
	z
		.object({
			type: z.literal("bind"),
			hostPath: z.string().min(1, "application.volumes.hostPathRequired"),
		})
		.merge(mountSchema),
	z
		.object({
			type: z.literal("volume"),
			volumeName: z
				.string()
				.min(1, "application.volumes.volumeNameRequired")
				.regex(
					/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/,
					"application.volumes.invalidVolumeName",
				),
		})
		.merge(mountSchema),
	z
		.object({
			type: z.literal("file"),
			content: z.string().optional(),
			filePath: z.string().min(1, "application.volumes.filePathRequired"),
		})
		.merge(mountSchema),
]);

type UpdateMount = z.infer<typeof mySchema>;

interface Props {
	mountId: string;
	type: "bind" | "volume" | "file";
	refetch: () => void;
	serviceType:
		| "application"
		| "compose"
		| "libsql"
		| "mariadb"
		| "mongo"
		| "mysql"
		| "postgres"
		| "redis";
}

export const UpdateVolume = ({
	mountId,
	type,
	refetch,
	serviceType,
}: Props) => {
	const { t } = useTranslation();
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
	const { data: diskContent, isFetching: isReadingDisk } =
		api.mounts.readFileContent.useQuery(
			{ mountId },
			{
				enabled: !!mountId && isOpen && type === "file",
				refetchOnWindowFocus: false,
			},
		);

	const { mutateAsync, isPending, error, isError, reset } =
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
					content: diskContent ?? (data.content || ""),
					mountPath: serviceType === "compose" ? "/" : data.mountPath,
					filePath: data.filePath || "",
					type: "file",
				});
			}
		}
	}, [form, form.reset, data, diskContent]);

	const onSubmit = async (data: UpdateMount) => {
		if (data.type === "bind") {
			await mutateAsync({
				hostPath: data.hostPath,
				mountPath: data.mountPath,
				type: data.type,
				mountId,
			})
				.then(() => {
					toast.success(t("application.volumes.updated"));
					setIsOpen(false);
				})
				.catch(() => {
					toast.error(t("application.volumes.updateBindError"));
				});
		} else if (data.type === "volume") {
			await mutateAsync({
				volumeName: data.volumeName,
				mountPath: data.mountPath,
				type: data.type,
				mountId,
			})
				.then(() => {
					toast.success(t("application.volumes.updated"));
					setIsOpen(false);
				})
				.catch(() => {
					toast.error(t("application.volumes.updateVolumeError"));
				});
		} else if (data.type === "file") {
			await mutateAsync({
				content: data.content,
				mountPath: data.mountPath,
				type: data.type,
				filePath: data.filePath,
				mountId,
				expectedContent: diskContent,
			})
				.then(() => {
					toast.success(t("application.volumes.updated"));
					setIsOpen(false);
				})
				.catch(() => {
					toast.error(t("application.volumes.updateFileError"));
				});
		}
		refetch();
	};

	return (
		<Dialog
			open={isOpen}
			onOpenChange={(open) => {
				setIsOpen(open);
				reset();
			}}
		>
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
					<DialogTitle>{t("application.volumes.updateTitle")}</DialogTitle>
					<DialogDescription>
						{t("application.volumes.updateDescription")}
					</DialogDescription>
				</DialogHeader>
				{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}
				{type === "file" && (
					<AlertBlock type="warning">
						{t("application.volumes.recreateWarning")}
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
											<FormLabel>{t("application.volumes.hostPath")}</FormLabel>
											<FormControl>
												<Input
													placeholder={t("application.volumes.hostPath")}
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
											<FormLabel>
												{t("application.volumes.volumeName")}
											</FormLabel>
											<FormControl>
												<Input
													placeholder={t("application.volumes.volumeName")}
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
											<FormItem className="w-full max-w-180">
												<FormLabel>
													{t("application.volumes.content")}
												</FormLabel>
												<FormControl>
													<FormControl>
														<CodeEditor
															language="properties"
															placeholder={`NODE_ENV=production
PORT=3000
`}
															className="h-96 font-mono w-full"
															{...field}
															disabled={isReadingDisk}
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
												<FormLabel>
													{t("application.volumes.filePath")}
												</FormLabel>
												<FormControl>
													<Input
														disabled
														placeholder={t(
															"application.volumes.fileNamePlaceholder",
														)}
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
											<FormLabel>
												{t("application.volumes.mountPath")}
											</FormLabel>
											<FormControl>
												<Input
													placeholder={t("application.volumes.mountPath")}
													{...field}
													disabled={isReadingDisk}
												/>
											</FormControl>

											<FormMessage />
										</FormItem>
									)}
								/>
							)}
						</div>
						<DialogFooter>
							<Button
								isLoading={isPending || isReadingDisk}
								// form="hook-form-update-volume"
								type="submit"
							>
								{t("application.volumes.update")}
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
};

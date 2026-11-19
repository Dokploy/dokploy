import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { Upload } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
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
import { Dropzone } from "@/components/ui/dropzone";
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
import {
	type UploadFileToContainer,
	uploadFileToContainerSchema,
} from "@/utils/schema";

interface Props {
	containerId: string;
	serverId?: string;
	children?: React.ReactNode;
}

export const UploadFileModal = ({ children, containerId, serverId }: Props) => {
	const { t } = useTranslation();
	const [open, setOpen] = useState(false);

	const { mutateAsync: uploadFile, isPending: isLoading } =
		api.docker.uploadFileToContainer.useMutation({
			onSuccess: () => {
				toast.success(t("docker.upload.success"));
				setOpen(false);
				form.reset();
			},
			onError: (error) => {
				toast.error(error.message || t("docker.upload.failed"));
			},
		});

	const form = useForm({
		resolver: zodResolver(uploadFileToContainerSchema),
		defaultValues: {
			containerId,
			destinationPath: "/",
			serverId: serverId || undefined,
		},
	});

	const file = form.watch("file");

	const onSubmit = async (values: UploadFileToContainer) => {
		if (!values.file) {
			toast.error(t("docker.upload.selectFile"));
			return;
		}

		const formData = new FormData();
		formData.append("containerId", values.containerId);
		formData.append("file", values.file);
		formData.append("destinationPath", values.destinationPath);
		if (values.serverId) {
			formData.append("serverId", values.serverId);
		}

		await uploadFile(formData);
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<DropdownMenuItem
					className="w-full cursor-pointer space-x-3"
					onSelect={(e) => e.preventDefault()}
				>
					{children}
				</DropdownMenuItem>
			</DialogTrigger>
			<DialogContent className="sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<Upload className="h-5 w-5" />
						{t("docker.upload.title")}
					</DialogTitle>
					<DialogDescription>
						{t("docker.upload.description")}
					</DialogDescription>
				</DialogHeader>

				<Form {...form}>
					<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
						<FormField
							control={form.control}
							name="destinationPath"
							render={({ field }) => (
								<FormItem>
									<FormLabel>{t("docker.upload.destinationPath")}</FormLabel>
									<FormControl>
										<Input
											{...field}
											placeholder="/path/to/file"
											className="font-mono"
										/>
									</FormControl>
									<FormMessage />
									<p className="text-xs text-muted-foreground">
										{t("docker.upload.destinationPathHint")}
									</p>
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name="file"
							render={({ field }) => (
								<FormItem>
									<FormLabel>{t("docker.upload.file")}</FormLabel>
									<FormControl>
										<Dropzone
											{...field}
											dropMessage={t("docker.upload.dropMessage")}
											onChange={(files) => {
												if (files && files.length > 0) {
													field.onChange(files[0]);
												} else {
													field.onChange(null);
												}
											}}
										/>
									</FormControl>
									<FormMessage />
									{file instanceof File && (
										<div className="flex items-center gap-2 p-2 bg-muted rounded-md">
											<span className="text-sm text-muted-foreground flex-1">
												{file.name} ({(file.size / 1024).toFixed(2)} KB)
											</span>
											<Button
												type="button"
												variant="ghost"
												size="sm"
												onClick={() => field.onChange(null)}
											>
												{t("docker.upload.remove")}
											</Button>
										</div>
									)}
								</FormItem>
							)}
						/>

						<DialogFooter>
							<Button
								type="button"
								variant="outline"
								onClick={() => setOpen(false)}
							>
								{t("docker.common.cancel")}
							</Button>
							<Button
								type="submit"
								isLoading={isLoading}
								disabled={!file || isLoading}
							>
								{t("docker.upload.submit")}
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
};

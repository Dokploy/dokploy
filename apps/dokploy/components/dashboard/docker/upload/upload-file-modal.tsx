import { zodResolver } from "@hookform/resolvers/zod";
import { Upload } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
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
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Dropzone } from "@/components/ui/dropzone";
import { api } from "@/utils/api";
import {
	uploadFileToContainerSchema,
	type UploadFileToContainer,
} from "@/utils/schema";

interface Props {
	containerId: string;
	serverId?: string;
	children?: React.ReactNode;
}

export const UploadFileModal = ({
	children,
	containerId,
	serverId,
}: Props) => {
	const [open, setOpen] = useState(false);

	const { mutateAsync: uploadFile, isLoading } =
		api.docker.uploadFileToContainer.useMutation({
			onSuccess: () => {
				toast.success("File uploaded successfully");
				setOpen(false);
				form.reset();
			},
			onError: (error) => {
				toast.error(
					error.message || "Failed to upload file to container",
				);
			},
		});

	const form = useForm<UploadFileToContainer>({
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
			toast.error("Please select a file to upload");
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
						Upload File to Container
					</DialogTitle>
					<DialogDescription>
						Upload a file directly into the container's filesystem
					</DialogDescription>
				</DialogHeader>

				<Form {...form}>
					<form
						onSubmit={form.handleSubmit(onSubmit)}
						className="space-y-4"
					>
						<FormField
							control={form.control}
							name="destinationPath"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Destination Path</FormLabel>
									<FormControl>
										<Input
											{...field}
											placeholder="/path/to/file"
											className="font-mono"
										/>
									</FormControl>
									<FormMessage />
									<p className="text-xs text-muted-foreground">
										Enter the full path where the file should be
										uploaded in the container (e.g., /app/config.json)
									</p>
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name="file"
							render={({ field }) => (
								<FormItem>
									<FormLabel>File</FormLabel>
									<FormControl>
										<Dropzone
											{...field}
											dropMessage="Drop file here or click to browse"
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
												Remove
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
								Cancel
							</Button>
							<Button
								type="submit"
								isLoading={isLoading}
								disabled={!file || isLoading}
							>
								Upload File
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
};


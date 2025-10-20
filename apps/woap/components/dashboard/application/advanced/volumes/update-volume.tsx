import { zodResolver } from "@hookform/resolvers/zod";
import { PenBoxIcon } from "lucide-react";
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

const mountSchema = z.object({
	mountPath: z.string().min(1, "Mount path required"),
});

const mySchema = z.discriminatedUnion("type", [
	z
		.object({
			type: z.literal("bind"),
			hostPath: z.string().min(1, "Host path required"),
		})
		.merge(mountSchema),
	z
		.object({
			type: z.literal("volume"),
			volumeName: z.string().min(1, "Volume name required"),
		})
		.merge(mountSchema),
	z
		.object({
			type: z.literal("file"),
			content: z.string().optional(),
			filePath: z.string().min(1, "File path required"),
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
					toast.success("Mount Update");
					setIsOpen(false);
				})
				.catch(() => {
					toast.error("Error updating the Bind mount");
				});
		} else if (data.type === "volume") {
			await mutateAsync({
				volumeName: data.volumeName,
				mountPath: data.mountPath,
				type: data.type,
				mountId,
			})
				.then(() => {
					toast.success("Mount Update");
					setIsOpen(false);
				})
				.catch(() => {
					toast.error("Error updating the Volume mount");
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
					toast.success("Mount Update");
					setIsOpen(false);
				})
				.catch(() => {
					toast.error("Error updating the File mount");
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
					<DialogTitle>Update</DialogTitle>
					<DialogDescription>Update the mount</DialogDescription>
				</DialogHeader>
				{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}
				{type === "file" && (
					<AlertBlock type="warning">
						Updating the mount will recreate the file or directory.
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
											<FormLabel>Host Path</FormLabel>
											<FormControl>
												<Input placeholder="Host Path" {...field} />
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
											<FormLabel>Volume Name</FormLabel>
											<FormControl>
												<Input
													placeholder="Volume Name"
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
												<FormLabel>Content</FormLabel>
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
												<FormLabel>File Path</FormLabel>
												<FormControl>
													<Input
														disabled
														placeholder="Name of the file"
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
											<FormLabel>Mount Path (In the container)</FormLabel>
											<FormControl>
												<Input placeholder="Mount Path" {...field} />
											</FormControl>

											<FormMessage />
										</FormItem>
									)}
								/>
							)}
						</div>
						<DialogFooter>
							<Button
								isLoading={isLoading}
								// form="hook-form-update-volume"
								type="submit"
							>
								Update
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
};

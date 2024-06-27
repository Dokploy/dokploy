import { zodResolver } from "@hookform/resolvers/zod";
import type React from "react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
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
import { Button } from "@/components/ui/button";
import { PlusIcon } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/utils/api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
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
		})
		.merge(mountSchema),
]);

type AddMount = z.infer<typeof mySchema>;

export const AddVolumes = ({
	serviceId,
	serviceType,
	refetch,
	children = <PlusIcon className="h-4 w-4" />,
}: Props) => {
	const [isOpen, setIsOpen] = useState(false);
	const { mutateAsync } = api.mounts.create.useMutation();
	const form = useForm<AddMount>({
		defaultValues: {
			type: serviceType === "compose" ? "file" : "bind",
			hostPath: "",
			mountPath: "",
		},
		resolver: zodResolver(mySchema),
	});
	const type = form.watch("type");

	useEffect(() => {
		if (isOpen) {
			form.reset();
		}
	}, [isOpen, form.reset]);

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
					toast.success("Mount Created");
					setIsOpen(false);
				})
				.catch(() => {
					toast.error("Error to create the Bind mount");
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
					toast.success("Mount Created");
					setIsOpen(false);
				})
				.catch(() => {
					toast.error("Error to create the Volume mount");
				});
		} else if (data.type === "file") {
			await mutateAsync({
				serviceId,
				content: data.content,
				mountPath: data.mountPath,
				type: data.type,
				serviceType,
			})
				.then(() => {
					toast.success("Mount Created");
					setIsOpen(false);
				})
				.catch(() => {
					toast.error("Error to create the File mount");
				});
		}

		refetch();
	};

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger className="" asChild>
				<Button>{children}</Button>
			</DialogTrigger>
			<DialogContent className="max-h-screen  overflow-y-auto sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>Volumes / Mounts</DialogTitle>
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
						<FormField
							control={form.control}
							defaultValue={form.control._defaultValues.type}
							name="type"
							render={({ field }) => (
								<FormItem className="space-y-3">
									<FormLabel className="text-muted-foreground">
										Select the Mount Type
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
																Bind Mount
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
																Volume Mount
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
															File Mount
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
								Fill the next fields.
							</FormLabel>
							<div className="flex flex-col gap-2">
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
									<FormField
										control={form.control}
										name="content"
										render={({ field }) => (
											<FormItem>
												<FormLabel>Content</FormLabel>
												<FormControl>
													<FormControl>
														<Textarea
															placeholder="Any content"
															className="h-64"
															{...field}
														/>
													</FormControl>
												</FormControl>
												<FormMessage />
											</FormItem>
										)}
									/>
								)}

								<FormField
									control={form.control}
									name="mountPath"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Mount Path</FormLabel>
											<FormControl>
												<Input placeholder="Mount Path" {...field} />
											</FormControl>

											<FormMessage />
										</FormItem>
									)}
								/>
							</div>
						</div>
					</form>

					<DialogFooter>
						<Button
							isLoading={form.formState.isSubmitting}
							form="hook-form-volume"
							type="submit"
						>
							Create
						</Button>
					</DialogFooter>
				</Form>
			</DialogContent>
		</Dialog>
	);
};

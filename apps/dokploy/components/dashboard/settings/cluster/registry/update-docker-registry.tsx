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
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { api } from "@/utils/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, PenBoxIcon } from "lucide-react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const updateRegistry = z.object({
	registryName: z.string().min(1, {
		message: "Registry name is required",
	}),
	username: z.string().min(1, {
		message: "Username is required",
	}),
	password: z.string(),
	registryUrl: z.string(),
	imagePrefix: z.string(),
	serverId: z.string().optional(),
});

type UpdateRegistry = z.infer<typeof updateRegistry>;

interface Props {
	registryId: string;
}

export const UpdateDockerRegistry = ({ registryId }: Props) => {
	const utils = api.useUtils();
	const { data: servers } = api.server.withSSHKey.useQuery();

	const { mutateAsync: testRegistry, isLoading } =
		api.registry.testRegistry.useMutation();
	const { data, refetch } = api.registry.one.useQuery(
		{
			registryId,
		},
		{
			enabled: !!registryId,
		},
	);

	const isCloud = data?.registryType === "cloud";
	const { mutateAsync, isError, error } = api.registry.update.useMutation();

	const form = useForm<UpdateRegistry>({
		defaultValues: {
			imagePrefix: "",
			registryName: "",
			username: "",
			password: "",
			registryUrl: "",
			serverId: "",
		},
		resolver: zodResolver(updateRegistry),
	});

	console.log(form.formState.errors);

	const password = form.watch("password");
	const username = form.watch("username");
	const registryUrl = form.watch("registryUrl");
	const registryName = form.watch("registryName");
	const imagePrefix = form.watch("imagePrefix");
	const serverId = form.watch("serverId");

	useEffect(() => {
		if (data) {
			form.reset({
				imagePrefix: data.imagePrefix || "",
				registryName: data.registryName || "",
				username: data.username || "",
				password: "",
				registryUrl: data.registryUrl || "",
				serverId: "",
			});
		}
	}, [form, form.reset, data]);

	const onSubmit = async (data: UpdateRegistry) => {
		await mutateAsync({
			registryId,
			...(data.password ? { password: data.password } : {}),
			registryName: data.registryName,
			username: data.username,
			registryUrl: data.registryUrl,
			imagePrefix: data.imagePrefix,
			serverId: data.serverId,
		})
			.then(async (data) => {
				toast.success("Registry Updated");
				await refetch();
				await utils.registry.all.invalidate();
			})
			.catch(() => {
				toast.error("Error updating the registry");
			});
	};
	return (
		<Dialog>
			<DialogTrigger className="" asChild>
				<Button variant="ghost">
					<PenBoxIcon className="size-4 text-muted-foreground" />
				</Button>
			</DialogTrigger>
			<DialogContent className="max-h-screen  overflow-y-auto sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>Registry</DialogTitle>
					<DialogDescription>Update the registry information</DialogDescription>
				</DialogHeader>
				{isError && (
					<div className="flex flex-row gap-4 rounded-lg bg-red-50 p-2 dark:bg-red-950">
						<AlertTriangle className="text-red-600 dark:text-red-400" />
						<span className="text-sm text-red-600 dark:text-red-400">
							{error?.message}
						</span>
					</div>
				)}

				<Form {...form}>
					<form
						id="hook-form"
						onSubmit={form.handleSubmit(onSubmit)}
						className="grid w-full gap-8 "
					>
						<div className="flex flex-col gap-4">
							<div className="flex flex-col gap-2">
								<FormField
									control={form.control}
									name="registryName"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Registry Name</FormLabel>
											<FormControl>
												<Input placeholder="Registry Name" {...field} />
											</FormControl>

											<FormMessage />
										</FormItem>
									)}
								/>

								<FormField
									control={form.control}
									name="username"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Username</FormLabel>
											<FormControl>
												<Input placeholder="Username" {...field} />
											</FormControl>

											<FormMessage />
										</FormItem>
									)}
								/>

								<FormField
									control={form.control}
									name="password"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Password</FormLabel>
											<FormControl>
												<Input
													placeholder="Password"
													{...field}
													type="password"
												/>
											</FormControl>

											<FormMessage />
										</FormItem>
									)}
								/>
								{isCloud && (
									<FormField
										control={form.control}
										name="imagePrefix"
										render={({ field }) => (
											<FormItem>
												<FormLabel>Image Prefix</FormLabel>
												<FormControl>
													<Input {...field} placeholder="Image Prefix" />
												</FormControl>

												<FormMessage />
											</FormItem>
										)}
									/>
								)}

								<FormField
									control={form.control}
									name="registryUrl"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Registry URL</FormLabel>
											<FormControl>
												<Input
													placeholder="https://aws_account_id.dkr.ecr.us-west-2.amazonaws.com"
													{...field}
												/>
											</FormControl>

											<FormMessage />
										</FormItem>
									)}
								/>
							</div>
						</div>
					</form>

					<DialogFooter className="flex flex-col w-full sm:justify-between gap-4 flex-wrap sm:flex-col">
						<div className="flex flex-col gap-4 border p-2 rounded-lg">
							<span className="text-sm text-muted-foreground">
								Select a server to test the registry. If you don't have a server
								choose the default one.
							</span>
							<FormField
								control={form.control}
								name="serverId"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Server (Optional)</FormLabel>
										<FormControl>
											<Select
												onValueChange={field.onChange}
												defaultValue={field.value}
											>
												<SelectTrigger className="w-full">
													<SelectValue placeholder="Select a server" />
												</SelectTrigger>
												<SelectContent>
													<SelectGroup>
														<SelectLabel>Servers</SelectLabel>
														{servers?.map((server) => (
															<SelectItem
																key={server.serverId}
																value={server.serverId}
															>
																{server.name}
															</SelectItem>
														))}
														<SelectItem value={"none"}>None</SelectItem>
													</SelectGroup>
												</SelectContent>
											</Select>
										</FormControl>

										<FormMessage />
									</FormItem>
								)}
							/>
							<Button
								type="button"
								variant={"secondary"}
								isLoading={isLoading}
								onClick={async () => {
									await testRegistry({
										username: username,
										password: password,
										registryUrl: registryUrl,
										registryName: registryName,
										registryType: "cloud",
										imagePrefix: imagePrefix,
										serverId: serverId,
									})
										.then((data) => {
											if (data) {
												toast.success("Registry Tested Successfully");
											} else {
												toast.error("Registry Test Failed");
											}
										})
										.catch(() => {
											toast.error("Error testing the registry");
										});
								}}
							>
								Test Registry
							</Button>
						</div>

						<Button
							isLoading={form.formState.isSubmitting}
							type="submit"
							form="hook-form"
						>
							Update
						</Button>
					</DialogFooter>
				</Form>
			</DialogContent>
		</Dialog>
	);
};

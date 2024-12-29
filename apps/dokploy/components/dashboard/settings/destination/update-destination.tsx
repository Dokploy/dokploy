import { AlertBlock } from "@/components/shared/alert-block";
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
import { PenBoxIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { S3_PROVIDERS } from "./constants";

const updateDestination = z.object({
	name: z.string().min(1, "Name is required"),
	provider: z.string().optional(),
	accessKeyId: z.string(),
	secretAccessKey: z.string(),
	bucket: z.string(),
	region: z.string(),
	endpoint: z.string(),
	serverId: z.string().optional(),
});

type UpdateDestination = z.infer<typeof updateDestination>;

interface Props {
	destinationId: string;
}

export const UpdateDestination = ({ destinationId }: Props) => {
	const utils = api.useUtils();
	const { data: servers } = api.server.withSSHKey.useQuery();
	const { data: isCloud } = api.settings.isCloud.useQuery();
	const [isOpen, setIsOpen] = useState(false);
	const { data, refetch } = api.destination.one.useQuery(
		{
			destinationId,
		},
		{
			enabled: !!destinationId,
		},
	);
	const { mutateAsync, isError, error } = api.destination.update.useMutation();
	const { mutateAsync: testConnection, isLoading: isLoadingConnection } =
		api.destination.testConnection.useMutation();
	const form = useForm<UpdateDestination>({
		defaultValues: {
			provider: "",
			accessKeyId: "",
			bucket: "",
			name: "",
			region: "",
			secretAccessKey: "",
			endpoint: "",
		},
		resolver: zodResolver(updateDestination),
	});

	useEffect(() => {
		if (data) {
			form.reset({
				accessKeyId: data.accessKey,
				bucket: data.bucket,
				endpoint: data.endpoint,
				name: data.name,
				region: data.region,
				secretAccessKey: data.secretAccessKey,
				provider: data.provider || "",
			});
		}
	}, [form, form.reset, data]);

	const onSubmit = async (data: UpdateDestination) => {
		await mutateAsync({
			accessKey: data.accessKeyId,
			bucket: data.bucket,
			endpoint: data.endpoint,
			name: data.name,
			region: data.region,
			secretAccessKey: data.secretAccessKey,
			destinationId,
			provider: data.provider || "",
		})
			.then(async () => {
				toast.success("Destination Updated");
				await refetch();
				await utils.destination.all.invalidate();
				setIsOpen(false);
			})
			.catch(() => {
				toast.error("Error updating the Destination");
			});
	};
	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger className="" asChild>
				<Button variant="ghost">
					<PenBoxIcon className="size-4  text-muted-foreground" />
				</Button>
			</DialogTrigger>
			<DialogContent className="max-h-screen  overflow-y-auto sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>Update Destination</DialogTitle>
					<DialogDescription>
						Update the current destination config
					</DialogDescription>
				</DialogHeader>
				{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}

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
									name="name"
									render={({ field }) => {
										return (
											<FormItem>
												<FormLabel>Name</FormLabel>
												<FormControl>
													<Input placeholder={"S3 Bucket"} {...field} />
												</FormControl>
												<FormMessage />
											</FormItem>
										);
									}}
								/>
								<FormField
									control={form.control}
									name="provider"
									render={({ field }) => {
										return (
											<FormItem>
												<FormLabel>Provider</FormLabel>
												<FormControl>
													<Select
														onValueChange={field.onChange}
														defaultValue={field.value}
													>
														<FormControl>
															<SelectTrigger>
																<SelectValue placeholder="Select a S3 Provider" />
															</SelectTrigger>
														</FormControl>
														<SelectContent>
															{S3_PROVIDERS.map((s3Provider) => (
																<SelectItem
																	key={s3Provider.key}
																	value={s3Provider.key}
																>
																	{s3Provider.name}
																</SelectItem>
															))}
														</SelectContent>
													</Select>
												</FormControl>
												<FormMessage />
											</FormItem>
										);
									}}
								/>

								<FormField
									control={form.control}
									name="accessKeyId"
									render={({ field }) => {
										return (
											<FormItem>
												<FormLabel>Access Key Id</FormLabel>
												<FormControl>
													<Input placeholder={"xcas41dasde"} {...field} />
												</FormControl>
												<FormMessage />
											</FormItem>
										);
									}}
								/>
								<FormField
									control={form.control}
									name="secretAccessKey"
									render={({ field }) => (
										<FormItem>
											<div className="space-y-0.5">
												<FormLabel>Secret Access Key</FormLabel>
											</div>
											<FormControl>
												<Input placeholder={"asd123asdasw"} {...field} />
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="bucket"
									render={({ field }) => (
										<FormItem>
											<div className="space-y-0.5">
												<FormLabel>Bucket</FormLabel>
											</div>
											<FormControl>
												<Input placeholder={"dokploy-bucket"} {...field} />
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="region"
									render={({ field }) => (
										<FormItem>
											<div className="space-y-0.5">
												<FormLabel>Region</FormLabel>
											</div>
											<FormControl>
												<Input placeholder={"us-east-1"} {...field} />
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="endpoint"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Endpoint</FormLabel>
											<FormControl>
												<Input
													placeholder={"https://us.bucket.aws/s3"}
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

					<DialogFooter
						className={cn(
							isCloud ? "!flex-col" : "flex-row",
							"flex w-full  !justify-between pt-3 gap-4",
						)}
					>
						{isCloud ? (
							<div className="flex flex-col gap-4 border p-2 rounded-lg">
								<span className="text-sm text-muted-foreground">
									Select a server to test the destination. If you don't have a
									server choose the default one.
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
									onClick={async () => {
										await testConnection({
											provider: form.getValues("provider") || "",
											accessKey: form.getValues("accessKeyId"),
											bucket: form.getValues("bucket"),
											endpoint: form.getValues("endpoint"),
											name: "Test",
											region: form.getValues("region"),
											secretAccessKey: form.getValues("secretAccessKey"),
											serverId: form.getValues("serverId"),
										})
											.then(async () => {
												toast.success("Connection Success");
											})
											.catch(() => {
												toast.error("Error connecting the provider");
											});
									}}
								>
									Test Connection
								</Button>
							</div>
						) : (
							<Button
								isLoading={isLoadingConnection}
								type="button"
								variant="secondary"
								onClick={async () => {
									await testConnection({
										provider: form.getValues("provider") || "",
										accessKey: form.getValues("accessKeyId"),
										bucket: form.getValues("bucket"),
										endpoint: form.getValues("endpoint"),
										name: "Test",
										region: form.getValues("region"),
										secretAccessKey: form.getValues("secretAccessKey"),
									})
										.then(async () => {
											toast.success("Connection Success");
										})
										.catch(() => {
											toast.error("Error connecting the provider");
										});
								}}
							>
								Test connection
							</Button>
						)}

						<Button
							form="hook-form"
							type="submit"
							isLoading={form.formState.isSubmitting}
						>
							Update
						</Button>
					</DialogFooter>
				</Form>
			</DialogContent>
		</Dialog>
	);
};

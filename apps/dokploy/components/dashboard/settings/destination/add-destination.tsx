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
import { api } from "@/utils/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const addDestination = z.object({
	name: z.string().min(1, "Name is required"),
	accessKeyId: z.string(),
	secretAccessKey: z.string(),
	bucket: z.string(),
	region: z.string(),
	endpoint: z.string(),
});

type AddDestination = z.infer<typeof addDestination>;

export const AddDestination = () => {
	const utils = api.useUtils();

	const { mutateAsync, isError, error, isLoading } =
		api.destination.create.useMutation();
	const { mutateAsync: testConnection, isLoading: isLoadingConnection } =
		api.destination.testConnection.useMutation();
	const form = useForm<AddDestination>({
		defaultValues: {
			accessKeyId: "",
			bucket: "",
			name: "",
			region: "",
			secretAccessKey: "",
			endpoint: "",
		},
		resolver: zodResolver(addDestination),
	});
	useEffect(() => {
		form.reset();
	}, [form, form.reset, form.formState.isSubmitSuccessful]);

	const onSubmit = async (data: AddDestination) => {
		await mutateAsync({
			accessKey: data.accessKeyId,
			bucket: data.bucket,
			endpoint: data.endpoint,
			name: data.name,
			region: data.region,
			secretAccessKey: data.secretAccessKey,
		})
			.then(async () => {
				toast.success("Destination Created");
				await utils.destination.all.invalidate();
			})
			.catch(() => {
				toast.error("Error to create the Destination");
			});
	};
	return (
		<Dialog>
			<DialogTrigger className="" asChild>
				<Button>Add Destination</Button>
			</DialogTrigger>
			<DialogContent className="max-h-screen  overflow-y-auto sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>Add Destination</DialogTitle>
					<DialogDescription>
						In this section you can add destinations for your backups.
					</DialogDescription>
				</DialogHeader>
				{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}

				<Form {...form}>
					<form
						id="hook-form-destination-add"
						onSubmit={form.handleSubmit(onSubmit)}
						className="grid w-full gap-4 "
					>
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
					</form>

					<DialogFooter className="flex w-full flex-row !justify-between pt-3">
						<Button
							isLoading={isLoadingConnection}
							type="button"
							variant="secondary"
							onClick={async () => {
								await testConnection({
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
										toast.error("Error to connect the provider");
									});
							}}
						>
							Test connection
						</Button>
						<Button
							isLoading={isLoading}
							form="hook-form-destination-add"
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

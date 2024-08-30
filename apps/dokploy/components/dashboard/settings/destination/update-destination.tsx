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
import { PenBoxIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const updateDestination = z.object({
	name: z.string().min(1, "Name is required"),
	accessKeyId: z.string(),
	secretAccessKey: z.string(),
	bucket: z.string(),
	region: z.string(),
	endpoint: z.string(),
});

type UpdateDestination = z.infer<typeof updateDestination>;

interface Props {
	destinationId: string;
}

export const UpdateDestination = ({ destinationId }: Props) => {
	const utils = api.useUtils();
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
		})
			.then(async () => {
				toast.success("Destination Updated");
				await refetch();
				await utils.destination.all.invalidate();
				setIsOpen(false);
			})
			.catch(() => {
				toast.error("Error to update the Destination");
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
							isLoading={form.formState.isSubmitting}
							form="hook-form"
							type="submit"
						>
							Update
						</Button>
					</DialogFooter>
				</Form>
			</DialogContent>
		</Dialog>
	);
};

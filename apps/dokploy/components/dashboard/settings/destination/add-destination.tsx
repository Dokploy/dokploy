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
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { api } from "@/utils/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import {
	getObjectSchema,
	mergeFormValues,
	providerSchemas,
	providersData,
} from "../../application/domains/schema";
import { capitalize } from "lodash";

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
	const [provider, setProviders] = useState<keyof typeof providerSchemas>("s3");

	const { mutateAsync, isError, error, isLoading } =
		api.destination.create.useMutation();
	const { mutateAsync: testConnection, isLoading: isLoadingConnection } =
		api.destination.testConnection.useMutation();
	const schema = providerSchemas[provider];
	const form = useForm<z.infer<typeof schema>>({
		defaultValues: {
			...getObjectSchema(schema),
		},
		resolver: zodResolver(schema),
	});
	const {
		register,
		handleSubmit,
		control,
		formState: { errors },
	} = form;

	const onSubmit = async (data: z.infer<typeof schema>) => {
		// await mutateAsync({
		// 	accessKey: data.accessKeyId,
		// 	bucket: data.bucket,
		// 	endpoint: data.endpoint,
		// 	name: data.name,
		// 	region: data.region,
		// 	secretAccessKey: data.secretAccessKey,
		// })
		// 	.then(async () => {
		// 		toast.success("Destination Created");
		// 		await utils.destination.all.invalidate();
		// 	})
		// 	.catch(() => {
		// 		toast.error("Error to create the Destination");
		// 	});
	};

	const fields = Object.keys(schema.shape);
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
						className="grid w-full gap-8 "
					>
						<div className="flex flex-col gap-2">
							{fields.map((input) => (
								<FormField
									control={control}
									key={`${provider}.${input}`}
									name={`${provider}.${input}`}
									render={({ field }) => {
										return (
											<FormItem>
												<FormLabel>{capitalize(input)}</FormLabel>
												<FormControl>
													<Input placeholder={"Value"} {...field} />
												</FormControl>
												<span className="text-sm font-medium text-destructive">
													{errors[input]?.message}
												</span>
											</FormItem>
										);
									}}
								/>
							))}
						</div>
					</form>
				</Form>
				<Select
					onValueChange={(e) => {
						setProviders(e as keyof typeof providerSchemas);
					}}
					value={provider}
				>
					<SelectTrigger>
						<SelectValue placeholder="Select a provider" />
					</SelectTrigger>
					<SelectContent>
						<SelectGroup>
							{Object.keys(providerSchemas).map((registry) => (
								<SelectItem key={registry} value={registry}>
									{registry}
								</SelectItem>
							))}
							<SelectLabel>Providers ({providersData?.length})</SelectLabel>
						</SelectGroup>
					</SelectContent>
				</Select>
				<DialogFooter className="flex w-full flex-row !justify-between pt-3">
					<Button
						isLoading={isLoadingConnection}
						type="button"
						variant="secondary"
						onClick={async () => {
							const result = form.getValues()[provider];
							const hola = mergeFormValues(schema, result);
							console.log(hola);

							// const getPropertiesByForm = (form: any) => {
							// 	const initialValues = getInitialValues(schema);
							// 	console.log(form, initialValues);
							// 	const properties: any = {};
							// 	for (const key in form) {
							// 		const keysMatch = Object.keys(initialValues).filter(
							// 			(k) => k === key,
							// 		);
							// 		if (keysMatch.length === 0) {
							// 			continue;
							// 		}

							// 		properties[keysMatch[0]] = form[key] || "";
							// 		console.log(key);
							// 	}
							// 	return properties;
							// };
							// const result = form.getValues();
							// const properties = getPropertiesByForm(result);
							// console.log(properties);
							await testConnection({
								json: {
									...hola,
									provider: provider,
								},
								// accessKey: form.getValues("accessKeyId"),
								// bucket: form.getValues("bucket"),
								// endpoint: form.getValues("endpoint"),
								// name: "Test",
								// region: form.getValues("region"),
								// secretAccessKey: form.getValues("secretAccessKey"),
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
						// isLoading={isLoading}
						form="hook-form-destination-add"
						type="submit"
					>
						Create
					</Button>
					{/* */}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};

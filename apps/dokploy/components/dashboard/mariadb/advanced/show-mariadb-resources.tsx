import { AlertBlock } from "@dokploy/components/shared/alert-block";
import { Button } from "@dokploy/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@dokploy/components/ui/card";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@dokploy/components/ui/form";
import { Input } from "@dokploy/components/ui/input";
import { api } from "@dokploy/utils/api";
import { zodResolver } from "@hookform/resolvers/zod";
import React, { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const addResourcesMariadb = z.object({
	memoryReservation: z.number().nullable().optional(),
	cpuLimit: z.number().nullable().optional(),
	memoryLimit: z.number().nullable().optional(),
	cpuReservation: z.number().nullable().optional(),
});
interface Props {
	mariadbId: string;
}

type AddResourcesMariadb = z.infer<typeof addResourcesMariadb>;
export const ShowMariadbResources = ({ mariadbId }: Props) => {
	const { data, refetch } = api.mariadb.one.useQuery(
		{
			mariadbId,
		},
		{ enabled: !!mariadbId },
	);
	const { mutateAsync, isLoading } = api.mariadb.update.useMutation();
	const form = useForm<AddResourcesMariadb>({
		defaultValues: {},
		resolver: zodResolver(addResourcesMariadb),
	});

	useEffect(() => {
		if (data) {
			form.reset({
				cpuLimit: data?.cpuLimit || undefined,
				cpuReservation: data?.cpuReservation || undefined,
				memoryLimit: data?.memoryLimit || undefined,
				memoryReservation: data?.memoryReservation || undefined,
			});
		}
	}, [data, form, form.formState.isSubmitSuccessful, form.reset]);

	const onSubmit = async (formData: AddResourcesMariadb) => {
		await mutateAsync({
			mariadbId,
			cpuLimit: formData.cpuLimit || null,
			cpuReservation: formData.cpuReservation || null,
			memoryLimit: formData.memoryLimit || null,
			memoryReservation: formData.memoryReservation || null,
		})
			.then(async () => {
				toast.success("Resources Updated");
				await refetch();
			})
			.catch(() => {
				toast.error("Error to Update the resources");
			});
	};
	return (
		<Card className="bg-background">
			<CardHeader>
				<CardTitle className="text-xl">Resources</CardTitle>
				<CardDescription>
					If you want to decrease or increase the resources to a specific
					application or database
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				<AlertBlock type="info">
					Please remember to click Redeploy after modify the resources to apply
					the changes.
				</AlertBlock>
				<Form {...form}>
					<form
						id="hook-form"
						onSubmit={form.handleSubmit(onSubmit)}
						className="grid w-full gap-8 "
					>
						<div className="grid w-full md:grid-cols-2 gap-4">
							<FormField
								control={form.control}
								name="memoryReservation"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Memory Reservation</FormLabel>
										<FormControl>
											<Input
												placeholder="256 MB"
												{...field}
												value={field.value?.toString() || ""}
												onChange={(e) => {
													const value = e.target.value;
													if (value === "") {
														// Si el campo está vacío, establece el valor como null.
														field.onChange(null);
													} else {
														const number = Number.parseInt(value, 10);
														if (!Number.isNaN(number)) {
															// Solo actualiza el valor si se convierte a un número válido.
															field.onChange(number);
														}
													}
												}}
											/>
										</FormControl>

										<FormMessage />
									</FormItem>
								)}
							/>

							<FormField
								control={form.control}
								name="memoryLimit"
								render={({ field }) => {
									return (
										<FormItem>
											<FormLabel>Memory Limit</FormLabel>
											<FormControl>
												<Input
													placeholder={"1024 MB"}
													{...field}
													value={field.value?.toString() || ""}
													onChange={(e) => {
														const value = e.target.value;
														if (value === "") {
															// Si el campo está vacío, establece el valor como null.
															field.onChange(null);
														} else {
															const number = Number.parseInt(value, 10);
															if (!Number.isNaN(number)) {
																// Solo actualiza el valor si se convierte a un número válido.
																field.onChange(number);
															}
														}
													}}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									);
								}}
							/>

							<FormField
								control={form.control}
								name="cpuLimit"
								render={({ field }) => {
									return (
										<FormItem>
											<FormLabel>Cpu Limit</FormLabel>
											<FormControl>
												<Input
													placeholder={"2"}
													{...field}
													value={field.value?.toString() || ""}
													onChange={(e) => {
														const value = e.target.value;
														if (value === "") {
															// Si el campo está vacío, establece el valor como null.
															field.onChange(null);
														} else {
															const number = Number.parseInt(value, 10);
															if (!Number.isNaN(number)) {
																// Solo actualiza el valor si se convierte a un número válido.
																field.onChange(number);
															}
														}
													}}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									);
								}}
							/>
							<FormField
								control={form.control}
								name="cpuReservation"
								render={({ field }) => {
									return (
										<FormItem>
											<FormLabel>Cpu Reservation</FormLabel>
											<FormControl>
												<Input
													placeholder={"1"}
													{...field}
													value={field.value?.toString() || ""}
													onChange={(e) => {
														const value = e.target.value;
														if (value === "") {
															// Si el campo está vacío, establece el valor como null.
															field.onChange(null);
														} else {
															const number = Number.parseInt(value, 10);
															if (!Number.isNaN(number)) {
																// Solo actualiza el valor si se convierte a un número válido.
																field.onChange(number);
															}
														}
													}}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									);
								}}
							/>
						</div>
						<div className="flex w-full justify-end">
							<Button isLoading={isLoading} type="submit">
								Save
							</Button>
						</div>
					</form>
				</Form>
			</CardContent>
		</Card>
	);
};

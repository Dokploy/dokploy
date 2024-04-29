import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormMessage,
} from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/utils/api";
import { zodResolver } from "@hookform/resolvers/zod";
import React, { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const addEnviromentSchema = z.object({
	enviroment: z.string(),
});

type EnviromentSchema = z.infer<typeof addEnviromentSchema>;

interface Props {
	mongoId: string;
}

export const ShowMongoEnviroment = ({ mongoId }: Props) => {
	const { mutateAsync, isLoading } = api.mongo.saveEnviroment.useMutation();

	const { data, refetch } = api.mongo.one.useQuery(
		{
			mongoId,
		},
		{
			enabled: !!mongoId,
		},
	);
	const form = useForm<EnviromentSchema>({
		defaultValues: {
			enviroment: "",
		},
		resolver: zodResolver(addEnviromentSchema),
	});

	useEffect(() => {
		if (data) {
			form.reset({
				enviroment: data.env || "",
			});
		}
	}, [form.reset, data, form]);

	const onSubmit = async (data: EnviromentSchema) => {
		mutateAsync({
			env: data.enviroment,
			mongoId,
		})
			.then(async () => {
				toast.success("Enviroments Added");
				await refetch();
			})
			.catch(() => {
				toast.error("Error to add enviroment");
			});
	};

	return (
		<div className="flex w-full flex-col gap-5 ">
			<Card className="bg-background">
				<CardHeader>
					<CardTitle className="text-xl">Enviroment Settings</CardTitle>
					<CardDescription>
						You can add enviroment variables to your database.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<Form {...form}>
						<form
							id="hook-form"
							onSubmit={form.handleSubmit(onSubmit)}
							className="grid w-full gap-4 "
						>
							<FormField
								control={form.control}
								name="enviroment"
								render={({ field }) => (
									<FormItem className="w-full">
										<FormControl>
											<Textarea
												placeholder="MONGO_PASSWORD=1234567678"
												className="h-96"
												{...field}
											/>
										</FormControl>

										<FormMessage />
									</FormItem>
								)}
							/>

							<div className="flex flex-row justify-end">
								<Button isLoading={isLoading} className="w-fit" type="submit">
									Save
								</Button>
							</div>
						</form>
					</Form>
				</CardContent>
			</Card>
		</div>
	);
};

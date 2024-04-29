import React, { useEffect } from "react";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormMessage,
} from "@/components/ui/form";
import { api } from "@/utils/api";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";

const addEnviromentSchema = z.object({
	enviroment: z.string(),
});

type EnviromentSchema = z.infer<typeof addEnviromentSchema>;

interface Props {
	applicationId: string;
}

export const ShowEnviroment = ({ applicationId }: Props) => {
	const { mutateAsync, isLoading } =
		api.application.saveEnviroment.useMutation();

	const { data, refetch } = api.application.one.useQuery(
		{
			applicationId,
		},
		{
			enabled: !!applicationId,
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
			applicationId,
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
						You can add enviroment variables to your resource.
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
												placeholder="NODE_ENV=production"
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

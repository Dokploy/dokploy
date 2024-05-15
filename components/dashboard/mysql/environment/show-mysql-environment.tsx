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

const addEnvironmentSchema = z.object({
	environment: z.string(),
});

type EnvironmentSchema = z.infer<typeof addEnvironmentSchema>;

interface Props {
	mysqlId: string;
}

export const ShowMysqlEnvironment = ({ mysqlId }: Props) => {
	const { mutateAsync, isLoading } = api.mysql.saveEnvironment.useMutation();

	const { data, refetch } = api.mysql.one.useQuery(
		{
			mysqlId,
		},
		{
			enabled: !!mysqlId,
		},
	);
	const form = useForm<EnvironmentSchema>({
		defaultValues: {
			environment: "",
		},
		resolver: zodResolver(addEnvironmentSchema),
	});

	useEffect(() => {
		if (data) {
			form.reset({
				environment: data.env || "",
			});
		}
	}, [form.reset, data, form]);

	const onSubmit = async (data: EnvironmentSchema) => {
		mutateAsync({
			env: data.environment,
			mysqlId,
		})
			.then(async () => {
				toast.success("Environments Added");
				await refetch();
			})
			.catch(() => {
				toast.error("Error to add environment");
			});
	};

	return (
		<div className="flex w-full flex-col gap-5 ">
			<Card className="bg-background">
				<CardHeader>
					<CardTitle className="text-xl">Environment Settings</CardTitle>
					<CardDescription>
						You can add environment variables to your database.
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
								name="environment"
								render={({ field }) => (
									<FormItem className="w-full">
										<FormControl>
											<Textarea
												placeholder="MYSQL_PASSWORD=1234567678"
												className="h-96 font-mono"
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

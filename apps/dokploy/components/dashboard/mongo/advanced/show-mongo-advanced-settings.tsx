import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import React, { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { ShowVolumes } from "../volumes/show-volumes";
import { ShowMongoResources } from "./show-mongo-resources";

const addDockerImage = z.object({
	dockerImage: z.string().min(1, "Docker image is required"),
	command: z.string(),
});

interface Props {
	mongoId: string;
}

type AddDockerImage = z.infer<typeof addDockerImage>;
export const ShowAdvancedMongo = ({ mongoId }: Props) => {
	const { data, refetch } = api.mongo.one.useQuery(
		{
			mongoId,
		},
		{ enabled: !!mongoId },
	);
	const { mutateAsync } = api.mongo.update.useMutation();

	const form = useForm<AddDockerImage>({
		defaultValues: {
			dockerImage: "",
			command: "",
		},
		resolver: zodResolver(addDockerImage),
	});

	useEffect(() => {
		if (data) {
			form.reset({
				dockerImage: data.dockerImage,
				command: data.command || "",
			});
		}
	}, [data, form, form.formState.isSubmitSuccessful, form.reset]);

	const onSubmit = async (formData: AddDockerImage) => {
		await mutateAsync({
			mongoId,
			dockerImage: formData?.dockerImage,
			command: formData?.command,
		})
			.then(async () => {
				toast.success("Resources Updated");
				await refetch();
			})
			.catch(() => {
				toast.error("Error updating the resources");
			});
	};
	return (
		<>
			<div className="flex w-full flex-col gap-5 ">
				<Card className="bg-background">
					<CardHeader>
						<CardTitle className="text-xl">Advanced Settings</CardTitle>
					</CardHeader>
					<CardContent className="flex flex-col gap-4">
						<Form {...form}>
							<form
								onSubmit={form.handleSubmit(onSubmit)}
								className="grid w-full gap-4 "
							>
								<div className="grid w-full gap-4">
									<FormField
										control={form.control}
										name="dockerImage"
										render={({ field }) => (
											<FormItem>
												<FormLabel>Docker Image</FormLabel>
												<FormControl>
													<Input placeholder="mongo:16" {...field} />
												</FormControl>

												<FormMessage />
											</FormItem>
										)}
									/>
									<FormField
										control={form.control}
										name="command"
										render={({ field }) => (
											<FormItem>
												<FormLabel>Command</FormLabel>
												<FormControl>
													<Input placeholder="Custom command" {...field} />
												</FormControl>

												<FormMessage />
											</FormItem>
										)}
									/>
								</div>
								<div className="flex w-full justify-end">
									<Button isLoading={form.formState.isSubmitting} type="submit">
										Save
									</Button>
								</div>
							</form>
						</Form>
					</CardContent>
				</Card>
				<ShowVolumes mongoId={mongoId} />
				<ShowMongoResources mongoId={mongoId} />
			</div>
		</>
	);
};

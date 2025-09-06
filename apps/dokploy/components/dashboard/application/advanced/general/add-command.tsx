import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
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
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { api } from "@/utils/api";

interface Props {
	applicationId: string;
}

const AddRedirectSchema = z.object({
	command: z.string(),
	preDeployCommand: z.string().optional().nullable(),
	postDeployCommand: z.string().optional().nullable(),
});

type AddCommand = z.infer<typeof AddRedirectSchema>;

export const AddCommand = ({ applicationId }: Props) => {
	const { data } = api.application.one.useQuery(
		{
			applicationId,
		},
		{ enabled: !!applicationId },
	);

	const utils = api.useUtils();

	const { mutateAsync, isLoading } = api.application.update.useMutation();

	const form = useForm<AddCommand>({
		defaultValues: {
			command: "",
			preDeployCommand: "",
			postDeployCommand: "",
		},
		resolver: zodResolver(AddRedirectSchema),
	});

	useEffect(() => {
		if (data) {
			form.reset({
				command: data?.command || "",
				preDeployCommand: data?.preDeployCommand || "",
				postDeployCommand: data?.postDeployCommand || "",
			});
		}
	}, [
		form,
		form.reset,
		form.formState.isSubmitSuccessful,
		data?.command,
		data?.preDeployCommand,
		data?.postDeployCommand,
	]);

	const onSubmit = async (data: AddCommand) => {
		await mutateAsync({
			applicationId,
			command: data?.command,
			preDeployCommand: data?.preDeployCommand || "",
			postDeployCommand: data?.postDeployCommand || "",
		})
			.then(async () => {
				toast.success("Commands Updated");
				await utils.application.one.invalidate({
					applicationId,
				});
			})
			.catch(() => {
				toast.error("Error updating commands");
			});
	};

	return (
		<Card className="bg-background">
			<CardHeader className="flex flex-row justify-between">
				<div>
					<CardTitle className="text-xl">Commands</CardTitle>
					<CardDescription>
						Define container start command and pre/post deploy hooks
					</CardDescription>
				</div>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				<Form {...form}>
					<form
						onSubmit={form.handleSubmit(onSubmit)}
						className="grid w-full gap-4"
					>
						<div className="flex flex-col gap-4">
							<FormField
								control={form.control}
								name="command"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Container Start Command</FormLabel>
										<FormControl>
											<Input placeholder="e.g. npm start" {...field} />
										</FormControl>

										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="preDeployCommand"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Pre-Deploy Hook (runs once)</FormLabel>
										<FormControl>
											<Input placeholder="e.g. npm run db:migrate" {...field} />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="postDeployCommand"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Post-Deploy Hook (runs once)</FormLabel>
										<FormControl>
											<Input placeholder="e.g. npm run cache:warm" {...field} />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
						</div>
						<div className="flex justify-end">
							<Button isLoading={isLoading} type="submit" className="w-fit">
								Save
							</Button>
						</div>
					</form>
				</Form>
			</CardContent>
		</Card>
	);
};

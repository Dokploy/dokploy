import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { AlertBlock } from "@/components/shared/alert-block";
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
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { api } from "@/utils/api";

interface Props {
	composeId: string;
}

const AddRedirectSchema = z.object({
	command: z.string(),
});

type AddCommand = z.infer<typeof AddRedirectSchema>;

export const AddCommandCompose = ({ composeId }: Props) => {
	const { data } = api.compose.one.useQuery(
		{
			composeId,
		},
		{ enabled: !!composeId },
	);

	const { data: defaultCommand, refetch } =
		api.compose.getDefaultCommand.useQuery(
			{
				composeId,
			},
			{ enabled: !!composeId },
		);

	const utils = api.useUtils();

	const { mutateAsync, isLoading } = api.compose.update.useMutation();

	const form = useForm<AddCommand>({
		defaultValues: {
			command: "",
		},
		resolver: zodResolver(AddRedirectSchema),
	});

	useEffect(() => {
		if (data?.command) {
			form.reset({
				command: data?.command || "",
			});
		}
	}, [form, form.reset, form.formState.isSubmitSuccessful, data?.command]);

	const onSubmit = async (data: AddCommand) => {
		await mutateAsync({
			composeId,
			command: data?.command,
		})
			.then(async () => {
				toast.success("Command Updated");
				refetch();
				await utils.compose.one.invalidate({
					composeId,
				});
			})
			.catch(() => {
				toast.error("Error updating the command");
			});
	};

	return (
		<Card className="bg-background">
			<CardHeader className="flex flex-row justify-between">
				<div>
					<CardTitle className="text-xl">Run Command</CardTitle>
					<CardDescription>
						Override a custom command to the compose file
					</CardDescription>
				</div>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				<Form {...form}>
					<form
						onSubmit={form.handleSubmit(onSubmit)}
						className="grid w-full gap-4"
					>
						<AlertBlock type="warning">
							Modifying the default command may affect deployment stability,
							impacting logs and monitoring. Proceed carefully and test
							thoroughly. By default, the command starts with{" "}
							<strong>docker</strong>.
						</AlertBlock>
						<div className="flex flex-col gap-4">
							<FormField
								control={form.control}
								name="command"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Command</FormLabel>
										<FormControl>
											<Input placeholder="Custom command" {...field} />
										</FormControl>

										<FormDescription>
											Default Command ({defaultCommand})
										</FormDescription>
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

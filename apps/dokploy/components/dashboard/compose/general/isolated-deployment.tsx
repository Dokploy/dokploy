import { AlertBlock } from "@/components/shared/alert-block";
import { CodeEditor } from "@/components/shared/code-editor";
import { Button } from "@/components/ui/button";
import {
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	Form,
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
} from "@/components/ui/form";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { api } from "@/utils/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

interface Props {
	composeId: string;
}

const schema = z.object({
	isolatedDeployment: z.boolean().optional(),
});

type Schema = z.infer<typeof schema>;

export const IsolatedDeployment = ({ composeId }: Props) => {
	const utils = api.useUtils();
	const [compose, setCompose] = useState<string>("");
	const { mutateAsync, error, isError } =
		api.compose.isolatedDeployment.useMutation();

	const { mutateAsync: updateCompose } = api.compose.update.useMutation();

	const { data, refetch } = api.compose.one.useQuery(
		{ composeId },
		{ enabled: !!composeId },
	);

	console.log(data);

	const form = useForm<Schema>({
		defaultValues: {
			isolatedDeployment: false,
		},
		resolver: zodResolver(schema),
	});

	useEffect(() => {
		randomizeCompose();
		if (data) {
			form.reset({
				isolatedDeployment: data?.isolatedDeployment || false,
			});
		}
	}, [form, form.reset, form.formState.isSubmitSuccessful, data]);

	const onSubmit = async (formData: Schema) => {
		await updateCompose({
			composeId,
			isolatedDeployment: formData?.isolatedDeployment || false,
		})
			.then(async (_data) => {
				randomizeCompose();
				refetch();
				toast.success("Compose updated");
			})
			.catch(() => {
				toast.error("Error updating the compose");
			});
	};

	const randomizeCompose = async () => {
		await mutateAsync({
			composeId,
			suffix: data?.appName || "",
		})
			.then(async (data) => {
				await utils.project.all.invalidate();
				setCompose(data);
				toast.success("Compose Isolated");
			})
			.catch(() => {
				toast.error("Error isolating the compose");
			});
	};

	return (
		<>
			<DialogHeader>
				<DialogTitle>Isolate Deployment</DialogTitle>
				<DialogDescription>
					Use this option to isolate the deployment of this compose file.
				</DialogDescription>
			</DialogHeader>
			<div className="text-sm text-muted-foreground flex flex-col gap-2">
				<span>
					This feature creates an isolated environment for your deployment by
					adding unique prefixes to all resources. It establishes a dedicated
					network based on your compose file's name, ensuring your services run
					in isolation. This prevents conflicts when running multiple instances
					of the same template or services with identical names.
				</span>
				<div className="space-y-4">
					<div>
						<h4 className="font-medium mb-2">
							Resources that will be isolated:
						</h4>
						<ul className="list-disc list-inside">
							<li>Docker volumes</li>
							<li>Docker networks</li>
						</ul>
					</div>
				</div>
			</div>
			{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}
			<Form {...form}>
				<form
					onSubmit={form.handleSubmit(onSubmit)}
					id="hook-form-add-project"
					className="grid w-full gap-4"
				>
					{isError && (
						<div className="flex flex-row gap-4 rounded-lg items-center bg-red-50 p-2 dark:bg-red-950">
							<AlertTriangle className="text-red-600 dark:text-red-400" />
							<span className="text-sm text-red-600 dark:text-red-400">
								{error?.message}
							</span>
						</div>
					)}

					<div className="flex flex-col lg:flex-col  gap-4 w-full ">
						<div>
							<FormField
								control={form.control}
								name="isolatedDeployment"
								render={({ field }) => (
									<FormItem className="mt-4 flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
										<div className="space-y-0.5">
											<FormLabel>
												Enable Isolated Deployment ({data?.appName})
											</FormLabel>
											<FormDescription>
												Enable isolated deployment to the compose file.
											</FormDescription>
										</div>
										<FormControl>
											<Switch
												checked={field.value}
												onCheckedChange={field.onChange}
											/>
										</FormControl>
									</FormItem>
								)}
							/>
						</div>

						<div className="flex flex-col lg:flex-row  gap-4 w-full items-end justify-end">
							<Button
								form="hook-form-add-project"
								type="submit"
								className="lg:w-fit"
							>
								Save
							</Button>
						</div>
					</div>
					<div className="flex flex-col gap-4">
						<Label>Preview</Label>
						<pre>
							<CodeEditor
								value={compose || ""}
								language="yaml"
								readOnly
								height="50rem"
							/>
						</pre>
					</div>
				</form>
			</Form>
		</>
	);
};

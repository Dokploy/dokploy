import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
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
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/utils/api";

interface Props {
	applicationId: string;
}

const DeployHooksSchema = z.object({
	preDeployCommand: z.string().optional(),
	postDeployCommand: z.string().optional(),
});

type DeployHooks = z.infer<typeof DeployHooksSchema>;

const parseStoredHooks = (
	raw: string | null | undefined,
): { pre: string; post: string } => {
	if (!raw) return { pre: "", post: "" };
	try {
		const parsed = JSON.parse(raw);
		if (parsed && typeof parsed === "object") {
			return {
				pre: typeof parsed.pre === "string" ? parsed.pre : "",
				post: typeof parsed.post === "string" ? parsed.post : "",
			};
		}
	} catch {
		/* malformed payload — start empty */
	}
	return { pre: "", post: "" };
};

const serializeHooks = (values: DeployHooks): string | null => {
	const pre = values.preDeployCommand?.trim();
	const post = values.postDeployCommand?.trim();
	if (!pre && !post) return null;
	return JSON.stringify({
		...(pre ? { pre } : {}),
		...(post ? { post } : {}),
	});
};

export const DeployHooks = ({ applicationId }: Props) => {
	const { data } = api.application.one.useQuery(
		{ applicationId },
		{ enabled: !!applicationId },
	);

	const utils = api.useUtils();

	const { mutateAsync, isPending } = api.application.update.useMutation();

	const form = useForm<DeployHooks>({
		defaultValues: {
			preDeployCommand: "",
			postDeployCommand: "",
		},
		resolver: zodResolver(DeployHooksSchema),
	});

	useEffect(() => {
		if (data) {
			const { pre, post } = parseStoredHooks(data.deployHooks);
			form.reset({ preDeployCommand: pre, postDeployCommand: post });
		}
	}, [data, form]);

	const onSubmit = async (values: DeployHooks) => {
		await mutateAsync({
			applicationId,
			deployHooks: serializeHooks(values),
		})
			.then(async () => {
				toast.success("Deployment hooks updated");
				await utils.application.one.invalidate({ applicationId });
			})
			.catch(() => {
				toast.error("Error updating deployment hooks");
			});
	};

	return (
		<Card className="bg-background">
			<CardHeader className="flex flex-row justify-between">
				<div>
					<CardTitle className="text-xl">Deploy Hooks</CardTitle>
					<CardDescription>
						Run one-time commands inside your container at key points of the
						deployment. Non-zero exit aborts the deployment. Requires
						<code> sh </code>in the image.
					</CardDescription>
				</div>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				<Form {...form}>
					<form
						onSubmit={form.handleSubmit(onSubmit)}
						className="grid w-full gap-4"
					>
						<FormField
							control={form.control}
							name="preDeployCommand"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Pre-deploy command</FormLabel>
									<FormControl>
										<Textarea
											placeholder="pg_dump -U postgres mydb > /tmp/pre.sql"
											className="min-h-24 font-mono text-sm"
											{...field}
											value={field.value ?? ""}
										/>
									</FormControl>
									<FormDescription>
										Runs inside the previous container right before the new
										image replaces it. Skipped on first deployment.
									</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name="postDeployCommand"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Post-deploy command</FormLabel>
									<FormControl>
										<Textarea
											placeholder="npm run db:migrate"
											className="min-h-24 font-mono text-sm"
											{...field}
											value={field.value ?? ""}
										/>
									</FormControl>
									<FormDescription>
										Runs inside the new container after the swarm service is
										healthy.
									</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>

						<div className="flex justify-end">
							<Button isLoading={isPending} type="submit" className="w-fit">
								Save
							</Button>
						</div>
					</form>
				</Form>
			</CardContent>
		</Card>
	);
};

import { DashboardLayout } from "@/components/layouts/dashboard-layout";

import { AlertBlock } from "@/components/shared/alert-block";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { DialogFooter } from "@/components/ui/dialog";
import {
	Form,
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { appRouter } from "@/server/api/root";
import { api } from "@/utils/api";
import { validateRequest } from "@dokploy/server";
import { zodResolver } from "@hookform/resolvers/zod";
import { createServerSideHelpers } from "@trpc/react-query/server";
import { Settings } from "lucide-react";
import type { GetServerSidePropsContext } from "next";
import React, { useEffect, type ReactElement } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import superjson from "superjson";
import { z } from "zod";

const settings = z.object({
	cleanCacheOnApplications: z.boolean(),
	cleanCacheOnCompose: z.boolean(),
	cleanCacheOnPreviews: z.boolean(),
});

type SettingsType = z.infer<typeof settings>;

const Page = () => {
	const { data, refetch } = api.admin.one.useQuery();
	const { mutateAsync, isLoading, isError, error } =
		api.admin.update.useMutation();
	const form = useForm<SettingsType>({
		defaultValues: {
			cleanCacheOnApplications: false,
			cleanCacheOnCompose: false,
			cleanCacheOnPreviews: false,
		},
		resolver: zodResolver(settings),
	});
	useEffect(() => {
		form.reset({
			cleanCacheOnApplications: data?.cleanupCacheApplications || false,
			cleanCacheOnCompose: data?.cleanupCacheOnCompose || false,
			cleanCacheOnPreviews: data?.cleanupCacheOnPreviews || false,
		});
	}, [form, form.reset, form.formState.isSubmitSuccessful, data]);

	const onSubmit = async (values: SettingsType) => {
		await mutateAsync({
			cleanupCacheApplications: values.cleanCacheOnApplications,
			cleanupCacheOnCompose: values.cleanCacheOnCompose,
			cleanupCacheOnPreviews: values.cleanCacheOnPreviews,
		})
			.then(() => {
				toast.success("Settings updated");
				refetch();
			})
			.catch(() => {
				toast.error("Something went wrong");
			});
	};
	return (
		<div className="w-full">
			<Card className="h-full bg-sidebar  p-2.5 rounded-xl  max-w-5xl mx-auto">
				<div className="rounded-xl bg-background shadow-md ">
					<CardHeader className="">
						<CardTitle className="text-xl flex flex-row gap-2">
							<Settings className="size-6 text-muted-foreground self-center" />
							Settings
						</CardTitle>
						<CardDescription>Manage your Dokploy settings</CardDescription>
						{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}
					</CardHeader>
					<CardContent className="space-y-2 py-8 border-t">
						<Form {...form}>
							<form
								id="hook-form-add-security"
								onSubmit={form.handleSubmit(onSubmit)}
								className="grid w-full gap-2"
							>
								<FormField
									control={form.control}
									name="cleanCacheOnApplications"
									render={({ field }) => (
										<FormItem className="flex flex-row items-center justify-between p-3 mt-4 border rounded-lg shadow-sm">
											<div className="space-y-0.5">
												<FormLabel>Clean Cache on Applications</FormLabel>
												<FormDescription>
													Clean the cache after every application deployment
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
								<FormField
									control={form.control}
									name="cleanCacheOnPreviews"
									render={({ field }) => (
										<FormItem className="flex flex-row items-center justify-between p-3 mt-4 border rounded-lg shadow-sm">
											<div className="space-y-0.5">
												<FormLabel>Clean Cache on Previews</FormLabel>
												<FormDescription>
													Clean the cache after every preview deployment
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
								<FormField
									control={form.control}
									name="cleanCacheOnCompose"
									render={({ field }) => (
										<FormItem className="flex flex-row items-center justify-between p-3 mt-4 border rounded-lg shadow-sm">
											<div className="space-y-0.5">
												<FormLabel>Clean Cache on Compose</FormLabel>
												<FormDescription>
													Clean the cache after every compose deployment
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
								<DialogFooter>
									<Button
										isLoading={isLoading}
										form="hook-form-add-security"
										type="submit"
									>
										Update
									</Button>
								</DialogFooter>
							</form>
						</Form>
					</CardContent>
				</div>
			</Card>
		</div>
	);
};

export default Page;

Page.getLayout = (page: ReactElement) => {
	return <DashboardLayout metaName="Server">{page}</DashboardLayout>;
};
export async function getServerSideProps(
	ctx: GetServerSidePropsContext<{ serviceId: string }>,
) {
	const { req, res } = ctx;
	const { user, session } = await validateRequest(ctx.req, ctx.res);
	if (!user) {
		return {
			redirect: {
				permanent: true,
				destination: "/",
			},
		};
	}
	if (user.rol === "user") {
		return {
			redirect: {
				permanent: true,
				destination: "/dashboard/settings/profile",
			},
		};
	}

	const helpers = createServerSideHelpers({
		router: appRouter,
		ctx: {
			req: req as any,
			res: res as any,
			db: null as any,
			session: session,
			user: user,
		},
		transformer: superjson,
	});
	await helpers.auth.get.prefetch();

	return {
		props: {
			trpcState: helpers.dehydrate(),
		},
	};
}

import { DialogAction } from "@/components/shared/dialog-action";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/utils/api";
import { Ban, CheckCircle2, RefreshCcw, Terminal } from "lucide-react";
import React from "react";
import { toast } from "sonner";
import { DockerTerminalModal } from "../../settings/web-server/docker-terminal-modal";
interface Props {
	redisId: string;
}

export const ShowGeneralRedis = ({ redisId }: Props) => {
	const { data, refetch } = api.redis.one.useQuery(
		{
			redisId,
		},
		{ enabled: !!redisId },
	);

	const { mutateAsync: deploy } = api.redis.deploy.useMutation();

	const { mutateAsync: reload, isLoading: isReloading } =
		api.redis.reload.useMutation();
	const { mutateAsync: start, isLoading: isStarting } =
		api.redis.start.useMutation();

	const { mutateAsync: stop, isLoading: isStopping } =
		api.redis.stop.useMutation();

	return (
		<>
			<div className="flex w-full flex-col gap-5 ">
				<Card className="bg-background">
					<CardHeader>
						<CardTitle className="text-xl">Deploy Settings</CardTitle>
					</CardHeader>
					<CardContent className="flex flex-row gap-4 flex-wrap">
						{/* <DeployRedis redisId={redisId} /> */}
						<DialogAction
							title="Deploy Redis"
							description="Are you sure you want to deploy this redis?"
							type="default"
							onClick={async () => {
								await deploy({
									redisId: redisId,
								})
									.then(() => {
										toast.success("Redis deployed successfully");
										refetch();
									})
									.catch(() => {
										toast.error("Error deploying Redis");
									});
							}}
						>
							<Button
								variant="default"
								isLoading={data?.applicationStatus === "running"}
							>
								Deploy
							</Button>
						</DialogAction>
						<DialogAction
							title="Reload Redis"
							description="Are you sure you want to reload this redis?"
							type="default"
							onClick={async () => {
								await reload({
									redisId: redisId,
									appName: data?.appName || "",
								})
									.then(() => {
										toast.success("Redis reloaded successfully");
										refetch();
									})
									.catch(() => {
										toast.error("Error reloading Redis");
									});
							}}
						>
							<Button variant="secondary" isLoading={isReloading}>
								Reload
								<RefreshCcw className="size-4" />
							</Button>
						</DialogAction>
						{/* <ResetRedis redisId={redisId} appName={data?.appName || ""} /> */}
						{data?.applicationStatus === "idle" ? (
							<DialogAction
								title="Start Redis"
								description="Are you sure you want to start this redis?"
								type="default"
								onClick={async () => {
									await start({
										redisId: redisId,
									})
										.then(() => {
											toast.success("Redis started successfully");
											refetch();
										})
										.catch(() => {
											toast.error("Error starting Redis");
										});
								}}
							>
								<Button variant="secondary" isLoading={isStarting}>
									Start
									<CheckCircle2 className="size-4" />
								</Button>
							</DialogAction>
						) : (
							<DialogAction
								title="Stop Redis"
								description="Are you sure you want to stop this redis?"
								onClick={async () => {
									await stop({
										redisId: redisId,
									})
										.then(() => {
											toast.success("Redis stopped successfully");
											refetch();
										})
										.catch(() => {
											toast.error("Error stopping Redis");
										});
								}}
							>
								<Button variant="destructive" isLoading={isStopping}>
									Stop
									<Ban className="size-4" />
								</Button>
							</DialogAction>
						)}

						<DockerTerminalModal
							appName={data?.appName || ""}
							serverId={data?.serverId || ""}
						>
							<Button variant="outline">
								<Terminal />
								Open Terminal
							</Button>
						</DockerTerminalModal>
					</CardContent>
				</Card>
			</div>
		</>
	);
};

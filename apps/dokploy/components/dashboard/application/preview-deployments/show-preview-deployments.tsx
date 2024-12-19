import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { api } from "@/utils/api";
import { RocketIcon } from "lucide-react";
import React from "react";
import { toast } from "sonner";
import { PreviewDeploymentCard } from "./preview-deployment-card";
import { ShowPreviewSettings } from "./show-preview-settings";

interface Props {
	applicationId: string;
}

export const ShowPreviewDeployments = ({ applicationId }: Props) => {
	const { data } = api.application.one.useQuery({ applicationId });

	const { mutateAsync: deletePreviewDeployment, isLoading } =
		api.previewDeployment.delete.useMutation();
	const { data: previewDeployments, refetch: refetchPreviewDeployments } =
		api.previewDeployment.all.useQuery(
			{ applicationId },
			{
				enabled: !!applicationId,
			},
		);


  const handleDeletePreviewDeployment = async (previewDeploymentId: string) => {
      deletePreviewDeployment({
        previewDeploymentId: previewDeploymentId,
      })
        .then(() => {
          refetchPreviewDeployments();
          toast.success("Preview deployment deleted");
        })
        .catch((error) => {
          toast.error(error.message);
        });
    };  

	// const [url, setUrl] = React.useState("");
	// useEffect(() => {
	// 	setUrl(document.location.origin);
	// }, []);

	return (
		<Card className="bg-background">
			<CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
				<div className="flex flex-col gap-2">
					<CardTitle className="text-xl">Preview Deployments</CardTitle>
					<CardDescription>See all the preview deployments</CardDescription>
				</div>
				{data?.isPreviewDeploymentsActive && (
					<ShowPreviewSettings applicationId={applicationId} />
				)}
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				{data?.isPreviewDeploymentsActive ? (
					<>
						<div className="flex flex-col gap-2 text-sm">
							<span>
								Preview deployments are a way to test your application before it
								is deployed to production. It will create a new deployment for
								each pull request you create.
							</span>
						</div>
						{data?.previewDeployments?.length === 0 ? (
							<div className="flex w-full flex-col items-center justify-center gap-3 pt-10">
								<RocketIcon className="size-8 text-muted-foreground" />
								<span className="text-base text-muted-foreground">
									No preview deployments found
								</span>
							</div>
						) : (
							<div className="flex flex-col gap-4">
								{previewDeployments?.map((previewDeployment) => {
									const { deployments, domain } = previewDeployment;

                  return (
                    <div className="flex justify-between gap-2 w-full">
                      <div className="flex w-full flex-col gap-2">
                        {deployments?.length === 0 ? (
                          <div>
                            <span className="text-sm text-muted-foreground">
                              No deployments found
                            </span>
                          </div>
                        ) : (
                          <PreviewDeploymentCard
                            key={previewDeployment?.previewDeploymentId || ""}
                            appName={previewDeployment.appName}
                            serverId={data?.serverId || ""}
                            onDeploymentDelete={handleDeletePreviewDeployment}
                            deploymentId={previewDeployment.previewDeploymentId}
                            deploymentUrl={`http://${domain?.host}`}
                            deployments={previewDeployment?.deployments || []}
                            domainId={domain?.domainId}
                            domainHost={domain?.host}
                            pullRequestTitle={
                              previewDeployment?.pullRequestTitle
                            }
                            pullRequestUrl={previewDeployment?.pullRequestURL}
                            status={previewDeployment.previewStatus}
                            branch={previewDeployment?.branch}
                            date={previewDeployment?.createdAt}
                            isLoading={isLoading}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
				) : (
					<div className="flex w-full flex-col items-center justify-center gap-3 pt-10">
						<RocketIcon className="size-8 text-muted-foreground" />
						<span className="text-base text-muted-foreground">
							Preview deployments are disabled for this application, please
							enable it
						</span>
						<ShowPreviewSettings applicationId={applicationId} />
					</div>
				)}
			</CardContent>
		</Card>
	);
};

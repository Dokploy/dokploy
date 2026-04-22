type DeployJobBase = {
	titleLog: string;
	descriptionLog: string;
	server?: boolean;
	type: "deploy" | "redeploy";
	serverId?: string;
	deploymentId?: string;
};

type DeployJob =
	| (DeployJobBase & {
			applicationId: string;
			applicationType: "application";
	  })
	| (DeployJobBase & {
			composeId: string;
			applicationType: "compose";
	  })
	| (DeployJobBase & {
			applicationId: string;
			applicationType: "application-preview";
			previewDeploymentId: string;
	  });

export type DeploymentJob = DeployJob;

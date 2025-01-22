import {
  deployRemoteApplication,
  deployRemoteCompose,
  deployRemotePreviewApplication,
  rebuildRemoteApplication,
  rebuildRemoteCompose,
  updateApplicationStatus,
  updateCompose,
  updatePreviewDeployment,
} from "@dokploy/server";
import type { DeployJob } from "./schema";

type ApplicationType = "application" | "compose" | "application-preview";
type DeployType = "deploy" | "redeploy";

interface DeploymentHandler {
  updateStatus: (id: string, status: string) => Promise<void>;
  deploy?: (job: DeployJob) => Promise<void>;
  redeploy?: (job: DeployJob) => Promise<void>;
}

const deploymentHandlers: Record<ApplicationType, DeploymentHandler> = {
  application: {
    updateStatus: (id: string, status: string) =>
      updateApplicationStatus(id, status),
    deploy: (job: DeployJob) =>
      deployRemoteApplication({
        applicationId: job.applicationId,
        titleLog: job.titleLog,
        descriptionLog: job.descriptionLog,
      }),
    redeploy: (job: DeployJob) =>
      rebuildRemoteApplication({
        applicationId: job.applicationId,
        titleLog: job.titleLog,
        descriptionLog: job.descriptionLog,
      }),
  },
  compose: {
    updateStatus: (id: string, status: string) =>
      updateCompose(id, { composeStatus: status }),
    deploy: (job: DeployJob) =>
      deployRemoteCompose({
        composeId: job.composeId,
        titleLog: job.titleLog,
        descriptionLog: job.descriptionLog,
      }),
    redeploy: (job: DeployJob) =>
      rebuildRemoteCompose({
        composeId: job.composeId,
        titleLog: job.titleLog,
        descriptionLog: job.descriptionLog,
      }),
  },
  "application-preview": {
    updateStatus: (id: string, status: string) =>
      updatePreviewDeployment(id, { previewStatus: status }),
    deploy: (job: DeployJob) =>
      deployRemotePreviewApplication({
        applicationId: job.applicationId,
        titleLog: job.titleLog,
        descriptionLog: job.descriptionLog,
        previewDeploymentId: job.previewDeploymentId,
      }),
  },
};

export const deploy = async (job: DeployJob) => {
  const handler = deploymentHandlers[job.applicationType as ApplicationType];
  const getId = () => {
    return job.applicationType === "compose"
      ? job.composeId
      : job.applicationType === "application-preview"
      ? job.previewDeploymentId
      : job.applicationId;
  };

  try {
    await handler.updateStatus(getId(), "running");

    if (job.server && handler[job.type as DeployType]) {
      await handler[job.type as DeployType]?.(job);
    }
  } catch (error) {
    await handler.updateStatus(getId(), "error");
  }

  return true;
};

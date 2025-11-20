import {
  createDomain,
  createMount,
  deleteMount,
  removeDomainById,
  updateCompose,
  type Compose,
} from "@dokploy/server";
import type { Template } from "@dokploy/server";

export type ComposeTemplateTarget = Compose & {
  mounts: Array<{ mountId: string }>;
  domains: Array<{ domainId: string }>;
};

interface ApplyTemplateOptions {
  composeFile?: string;
  sourceType?: Compose["sourceType"];
  isolatedDeployment?: boolean;
}

export const applyTemplateToCompose = async (
  compose: ComposeTemplateTarget,
  template: Template,
  options: ApplyTemplateOptions = {}
) => {
  for (const mount of compose.mounts ?? []) {
    await deleteMount(mount.mountId);
  }

  for (const domain of compose.domains ?? []) {
    await removeDomainById(domain.domainId);
  }

  const updatePayload: Partial<Compose> = {
    env: template.envs.join("\n"),
    isolatedDeployment: options.isolatedDeployment ?? true,
  };

  if (options.composeFile) {
    updatePayload.composeFile = options.composeFile;
    updatePayload.sourceType = options.sourceType ?? "raw";
  }

  await updateCompose(compose.composeId, updatePayload);

  if (template.mounts.length > 0) {
    for (const mount of template.mounts) {
      await createMount({
        filePath: mount.filePath,
        mountPath: "",
        content: mount.content,
        serviceId: compose.composeId,
        serviceType: "compose",
        type: "file",
      });
    }
  }

  if (template.domains.length > 0) {
    for (const domain of template.domains) {
      await createDomain({
        ...domain,
        domainType: "compose",
        certificateType: "none",
        composeId: compose.composeId,
        host: domain.host || "",
      });
    }
  }
};

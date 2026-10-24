import { TemplateGenerator } from "@/components/dashboard/project/ai/template-generator";
import { api } from "@/utils/api";

interface Props {
	environmentId: string;
	projectName?: string;
}

export const AddAiAssistant = ({ environmentId }: Props) => {
	const { data: permissions } = api.user.getPermissions.useQuery();

	if (!permissions?.ai.read) return null;

	return <TemplateGenerator environmentId={environmentId} />;
};

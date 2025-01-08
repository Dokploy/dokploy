import { TemplateGenerator } from "@/components/dashboard/project/ai/template-generator";

interface Props {
	projectId: string;
	projectName?: string;
}

export const AddAiAssistant = ({ projectId }: Props) => {
	return <TemplateGenerator projectId={projectId} />;
};

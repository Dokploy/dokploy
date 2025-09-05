import { TemplateGenerator } from "@/components/dashboard/project/ai/template-generator";

interface Props {
	environmentId: string;
	projectName?: string;
}

export const AddAiAssistant = ({ environmentId }: Props) => {
	return <TemplateGenerator environmentId={environmentId} />;
};

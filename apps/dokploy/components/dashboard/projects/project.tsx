// import { ComponentProps } from "react";
// import { formatDistanceToNow } from "date-fns";
// import { cn } from "@/lib/utils";
// import { Badge } from "@/components/ui/badge";

// interface Props {
//   item: ProjectType;
// }

// export const Project = ({ item }: Props) => {
//   return (
//     <button
//       className={cn(
//         "flex flex-col items-start gap-2 rounded-lg border p-5 text-left text-sm transition-all hover:bg-accent",
//       )}
//     >
//       <div className="flex w-full flex-col gap-1">
//         <div className="flex items-center">
//           <div className="flex items-center gap-2">
//             <div className="font-semibold">{item.name}</div>
//             {!item.read && (
//               <span className="flex h-2 w-2 rounded-full bg-blue-600" />
//             )}
//           </div>
//           <div className={cn("ml-auto text-xs", "text-muted-foreground")}>
//             {formatDistanceToNow(new Date(item.date), {
//               addSuffix: true,
//             })}
//           </div>
//         </div>
//       </div>
//       {item.labels.length ? (
//         <div className="flex items-center gap-2">
//           {item.labels.map((label) => (
//             <Badge key={label} variant={getBadgeVariantFromLabel(label)}>
//               {label}
//             </Badge>
//           ))}
//         </div>
//       ) : null}
//     </button>
//   );
// };

// const getBadgeVariantFromLabel = (
//   label: string,
// ): ComponentProps<typeof Badge>["variant"] => {
//   if (["work"].includes(label.toLowerCase())) {
//     return "default";
//   }

//   if (["personal"].includes(label.toLowerCase())) {
//     return "outline";
//   }

//   return "secondary";
// };

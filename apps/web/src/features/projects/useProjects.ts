import { useQuery } from "@tanstack/react-query";
import { api } from "../../shared/api/client.ts";
import type { ProjectListItem } from "../../shared/api/types.ts";

export const useProjects = () => useQuery({ queryKey: ["projects"], queryFn: () => api<{ projects: ProjectListItem[] }>("/v1/projects?limit=200").then((r) => r.projects) });

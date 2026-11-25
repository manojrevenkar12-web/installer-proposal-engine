import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../shared/api/client.ts";
import type { MonitoringSeries, ProjectDetail, Proposal, YearSeries } from "../../shared/api/types.ts";

export const useProject = (id: string) => useQuery({ queryKey: ["project", id], queryFn: () => api<ProjectDetail>(`/v1/projects/${id}`) });
export const useYear = (id: string, version: number | undefined) =>
  useQuery({ queryKey: ["year", id, version], queryFn: () => api<YearSeries>(`/v1/projects/${id}/year`), enabled: version !== undefined });
export const useMonitoring = (id: string, enabled: boolean) =>
  useQuery({ queryKey: ["monitoring", id], queryFn: () => api<MonitoringSeries>(`/v1/projects/${id}/monitoring`), enabled });

export function useNewProposal(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<Proposal>(`/v1/projects/${id}/proposals`, { method: "POST", headers: { "idempotency-key": crypto.randomUUID() } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["project", id] }); qc.invalidateQueries({ queryKey: ["projects"] }); qc.invalidateQueries({ queryKey: ["year", id] }); },
  });
}

export function useAccept(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (proposalId: string) => api<Proposal>(`/v1/proposals/${proposalId}/accept`, { method: "POST" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["project", id] }); qc.invalidateQueries({ queryKey: ["projects"] }); },
  });
}

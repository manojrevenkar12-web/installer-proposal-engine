import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "framer-motion";
import { useState } from "react";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { AftercarePage } from "../features/aftercare/AftercarePage.tsx";
import { ConnectPage } from "../features/connect/ConnectPage.tsx";
import { ProjectPage } from "../features/project/ProjectPage.tsx";
import { ProjectsPage } from "../features/projects/ProjectsPage.tsx";
import { StudyPage } from "../features/study/StudyPage.tsx";
import { apiKey } from "../shared/api/client.ts";
import { Layout } from "./Layout.tsx";

export function App({ client }: { client?: QueryClient }) {
  const [queryClient] = useState(() => client ?? new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 30_000 } } }));
  const [connected, setConnected] = useState(() => apiKey.get() !== null);
  return (
    <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion="user">
        <HashRouter>
          <Routes>
            <Route element={<Layout connected={connected} onDisconnect={() => { apiKey.clear(); queryClient.clear(); setConnected(false); }} />}>
              <Route path="/" element={connected ? <ProjectsPage /> : <ConnectPage onConnected={() => setConnected(true)} />} />
              <Route path="/projects/:id" element={connected ? <ProjectPage /> : <Navigate to="/" />} />
              <Route path="/aftercare" element={connected ? <AftercarePage /> : <Navigate to="/" />} />
              <Route path="/study" element={<StudyPage />} />
              <Route path="*" element={<Navigate to="/" />} />
            </Route>
          </Routes>
        </HashRouter>
      </MotionConfig>
    </QueryClientProvider>
  );
}

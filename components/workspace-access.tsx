"use client";

import { createContext, useContext } from "react";

const WorkspaceReadOnlyContext = createContext(true);

export function WorkspaceAccessProvider({ children, readOnly }: { children: React.ReactNode; readOnly: boolean }) {
  return <WorkspaceReadOnlyContext.Provider value={readOnly}>{children}</WorkspaceReadOnlyContext.Provider>;
}

export function useWorkspaceReadOnly() {
  return useContext(WorkspaceReadOnlyContext);
}

export function AdminOnly({ children }: { children: React.ReactNode }) {
  return useWorkspaceReadOnly() ? null : children;
}

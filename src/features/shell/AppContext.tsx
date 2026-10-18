"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { SystemRole, UserAccount, UserPrivilege } from "@/features/users/model";
import { hasPrivilege } from "@/features/users/model";
import type { ReferenceData } from "./client";

export type Route = { view: string; param: string | null; query: URLSearchParams };

export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#\/?/, "");
  const [pathPart = "", queryPart = ""] = raw.split("?");
  const [view = "", param = null] = pathPart.split("/");
  return { view: view || "home", param: param || null, query: new URLSearchParams(queryPart) };
}

export type Navigate = (view: string, param?: string | number | null, query?: Record<string, string>) => void;

/** The current view lives in the URL hash so refresh and the back button keep working. */
export function useHashRoute(): [Route, Navigate] {
  const [route, setRoute] = useState<Route>({ view: "home", param: null, query: new URLSearchParams() });
  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener("hashchange", onChange);
    onChange();
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  const navigate = useCallback<Navigate>((view, param, query) => {
    const search = query ? new URLSearchParams(Object.entries(query).filter(([, value]) => value !== "")).toString() : "";
    const next = `#/${view}${param !== undefined && param !== null && param !== "" ? `/${param}` : ""}${search ? `?${search}` : ""}`;
    if (window.location.hash === next) setRoute(parseHash(next));
    else window.location.hash = next;
  }, []);
  return [route, navigate];
}

export type ToastTone = "success" | "error" | "info";

export type AppContextValue = {
  user: UserAccount;
  setUser: (user: UserAccount) => void;
  reference: ReferenceData;
  refreshReference: () => Promise<void>;
  notify: (message: string, tone?: ToastTone) => void;
  route: Route;
  navigate: Navigate;
  openLead: (id: number) => void;
  openNewLead: () => void;
  signOut: () => Promise<void>;
  can: (privilege: UserPrivilege) => boolean;
  roleLabel: (role: SystemRole) => string;
  /** Bumps whenever lead data changes so lists and counts refetch. */
  dataVersion: number;
  bumpData: () => void;
};

export const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const value = useContext(AppContext);
  if (!value) throw new Error("useApp must be used inside AppShell.");
  return value;
}

export const canUser = (user: UserAccount, privilege: UserPrivilege) => hasPrivilege(user, privilege);

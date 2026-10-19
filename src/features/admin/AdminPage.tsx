"use client";

import { ShieldCheck } from "lucide-react";
import { useApp } from "@/features/shell/AppContext";
import ListValuesPanel from "./ListValuesPanel";
import SettingsPanel from "./SettingsPanel";
import TargetsPanel from "./TargetsPanel";
import UsersPanel from "./UsersPanel";

export const adminTabs = ["admin", "values", "targets", "settings", "devices"] as const;
export type AdminTab = (typeof adminTabs)[number];

export default function AdminPage({ tab }: { tab: AdminTab }) {
  const { can } = useApp();
  const allowed: Record<AdminTab, boolean> = {
    admin: can("manage_users"), values: can("manage_values"), targets: can("manage_targets"), settings: can("manage_settings"), devices: can("manage_settings"),
  };
  if (!allowed[tab]) {
    return <div className="panel no-access"><ShieldCheck size={22} /><strong>You do not have access to this area.</strong><span>Ask an administrator if you need it.</span></div>;
  }
  if (tab === "admin") return <UsersPanel />;
  if (tab === "values") return <ListValuesPanel />;
  if (tab === "targets") return <TargetsPanel />;
  if (tab === "settings") return <SettingsPanel />;
  return (
    <>
      <div className="page-heading"><div><div className="eyebrow">ADMINISTRATION</div><h1>Device authorization</h1><p>Restrict sign-in to approved company phones and laptops.</p></div></div>
      <div className="panel preview-panel">
        <ShieldCheck size={22} />
        <strong>Not available yet</strong>
        <p>The BRD asks for a registry of observed devices with authorize, revoke, and reassign actions, plus login restricted to approved devices. Standard browsers cannot read a hardware identifier, so this needs a managed-device or mobile-app identifier. Login history is already recorded per account and is visible on each user&apos;s page.</p>
      </div>
    </>
  );
}

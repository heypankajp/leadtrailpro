"use client";

import { useState, type FormEvent } from "react";
import { Eye, EyeOff } from "lucide-react";
import { errorMessage } from "@/lib/api";
import { useApp } from "@/features/shell/AppContext";
import { Dialog, ErrorText } from "@/features/shell/components";
import { createUser, updateUser } from "@/features/users/client";
import { rolePrivileges, stageLabels, systemRoles, userPrivileges, userStages, type SystemRole, type UserAccount, type UserPrivilege, type UserStage } from "@/features/users/model";

type Props = { user?: UserAccount; onClose: () => void; onSaved: (user: UserAccount) => void };

export default function UserFormDialog({ user, onClose, onSaved }: Props) {
  const { reference, roleLabel } = useApp();
  const [form, setForm] = useState({
    firstName: user?.firstName ?? "", lastName: user?.lastName ?? "", email: user?.email ?? "", phone: user?.phone ?? "",
    role: (user?.role ?? "sales_manager") as SystemRole, stage: (user?.stage ?? "onboarding") as UserStage,
    targetTemplateId: user?.targetTemplateId ? String(user.targetTemplateId) : "", twoFactorEnabled: user?.twoFactorEnabled ?? false, autoLogoutEnabled: user?.autoLogoutEnabled ?? false,
    password: "", confirmPassword: "",
  });
  const [extras, setExtras] = useState<UserPrivilege[]>(user?.extraPrivileges ?? []);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const defaults = rolePrivileges[form.role];

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((current) => ({ ...current, [key]: value }));

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user && form.password !== form.confirmPassword) { setError("Passwords do not match."); return; }
    setBusy(true);
    setError("");
    const shared = {
      firstName: form.firstName, lastName: form.lastName, email: form.email, phone: form.phone, role: form.role, stage: form.stage,
      extraPrivileges: extras.filter((privilege) => !defaults.includes(privilege)), twoFactorEnabled: form.twoFactorEnabled, autoLogoutEnabled: form.autoLogoutEnabled,
      targetTemplateId: form.targetTemplateId ? Number(form.targetTemplateId) : null,
    };
    try {
      const result = user ? await updateUser(user.id, shared) : await createUser({ ...shared, password: form.password });
      onSaved(result.user);
    } catch (caught) {
      setError(errorMessage(caught, "Could not save the user."));
      setBusy(false);
    }
  };

  return (
    <Dialog title={user ? `Edit ${user.name}` : "Add user"} eyebrow="TEAM ACCESS" onClose={onClose} size="wide">
      <form className="user-create-form" onSubmit={submit}>
        <div className="user-form-grid">
          <label>First name<input value={form.firstName} onChange={(event) => set("firstName", event.target.value)} autoComplete="given-name" required maxLength={80} /></label>
          <label>Last name<input value={form.lastName} onChange={(event) => set("lastName", event.target.value)} autoComplete="family-name" required maxLength={80} /></label>
          <label>Email<input type="email" value={form.email} onChange={(event) => set("email", event.target.value)} autoComplete="email" required maxLength={254} /></label>
          <label>Phone<input type="tel" value={form.phone} onChange={(event) => set("phone", event.target.value)} autoComplete="tel" maxLength={40} /></label>
          <label>Role<select value={form.role} onChange={(event) => set("role", event.target.value as SystemRole)}>{systemRoles.map((role) => <option key={role} value={role}>{roleLabel(role)}</option>)}</select></label>
          <label>Productivity stage<select value={form.stage} onChange={(event) => set("stage", event.target.value as UserStage)}>{userStages.map((stage) => <option key={stage} value={stage}>{stageLabels[stage]}</option>)}</select></label>
          <label className="user-form-wide">Target template
            <select value={form.targetTemplateId} onChange={(event) => set("targetTemplateId", event.target.value)}>
              <option value="">Use the stage default</option>
              {reference.targetTemplates.map((template) => <option key={template.id} value={template.id}>{template.name} ({stageLabels[template.stage]})</option>)}
            </select>
          </label>
          {!user && (
            <>
              <label className="user-form-wide">Initial password
                <span className="user-password-input-wrap">
                  <input type={showPassword ? "text" : "password"} value={form.password} onChange={(event) => set("password", event.target.value)} autoComplete="new-password" minLength={12} maxLength={200} required />
                  <button className="user-key-visibility" type="button" aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} onClick={() => setShowPassword((visible) => !visible)}>{showPassword ? <EyeOff size={15} /> : <Eye size={15} />}</button>
                </span>
                <small>Minimum 12 characters. {reference.mailerConfigured ? "You can also email a set-password link after creating the account." : "Share it directly; email delivery is not configured yet."}</small>
              </label>
              <label className="user-form-wide">Confirm password<input type="password" value={form.confirmPassword} onChange={(event) => set("confirmPassword", event.target.value)} autoComplete="new-password" minLength={12} maxLength={200} required /></label>
            </>
          )}
        </div>
        <fieldset className="user-privileges security-options">
          <legend>Security</legend>
          <label><input type="checkbox" checked={form.twoFactorEnabled} disabled={!reference.mailerConfigured && !form.twoFactorEnabled} onChange={(event) => set("twoFactorEnabled", event.target.checked)} />Two-factor sign-in by email code{!reference.mailerConfigured && <small> (needs SMTP settings)</small>}</label>
          <label><input type="checkbox" checked={form.autoLogoutEnabled} onChange={(event) => set("autoLogoutEnabled", event.target.checked)} />Automatic sign-out at 11:00 PM ({reference.timeZone})</label>
        </fieldset>
        <fieldset className="user-privileges">
          <legend>Privileges · {roleLabel(form.role)} defaults are included; tick extras to grant more</legend>
          {userPrivileges.map((privilege) => {
            const included = defaults.includes(privilege.id);
            return (
              <label key={privilege.id} className={included ? "is-default" : ""}>
                <input type="checkbox" checked={included || extras.includes(privilege.id)} disabled={included} onChange={(event) => setExtras((current) => event.target.checked ? [...current, privilege.id] : current.filter((item) => item !== privilege.id))} />
                {privilege.label}
              </label>
            );
          })}
        </fieldset>
        <ErrorText message={error} />
        <div className="user-dialog-actions"><button className="button button-outline" type="button" onClick={onClose}>Cancel</button><button className="button button-primary" type="submit" disabled={busy}>{busy ? "Saving..." : user ? "Save changes" : "Create user"}</button></div>
      </form>
    </Dialog>
  );
}

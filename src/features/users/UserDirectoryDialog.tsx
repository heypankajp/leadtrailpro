"use client";

import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, Eye, EyeOff, Plus, UserRound, X } from "lucide-react";
import { createUserAccount, fetchUsers } from "./client";
import { userPrivileges, userRoles } from "./model";
import type { CreateUserInput, UserAccount, UserPrivilege, UserRole } from "./model";

type Props = {
  mode: "manage" | "transfer";
  initialAccount?: boolean;
  onClose: () => void;
  onTransfer?: (user: UserAccount) => void;
  onNotify: (message: string) => void;
};

export default function UserDirectoryDialog({ mode, initialAccount = false, onClose, onTransfer, onNotify }: Props) {
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [managementKey, setManagementKey] = useState("");
  const [keyInput, setKeyInput] = useState("");
  const [isManagementKeyVisible, setIsManagementKeyVisible] = useState(false);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [hasAccess, setHasAccess] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    if (!hasAccess) return;
    let cancelled = false;
    fetchUsers(managementKey, mode)
      .then((loadedUsers) => {
        if (!cancelled) setUsers(loadedUsers);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : "Could not load users.");
          setHasAccess(false);
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [hasAccess, managementKey, mode]);

  const authenticate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoadError("");
    setIsLoading(true);
    setManagementKey(keyInput);
    setHasAccess(true);
  };

  const submitUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError("");
    setIsSaving(true);
    const form = event.currentTarget;
    const data = new FormData(form);
    const password = String(data.get("password") || "");
    const confirmPassword = String(data.get("confirmPassword") || "");
    if (password !== confirmPassword) {
      setFormError("Passwords do not match.");
      setIsSaving(false);
      return;
    }
    const input: CreateUserInput = {
      firstName: String(data.get("firstName") || "").trim(),
      lastName: String(data.get("lastName") || "").trim(),
      email: String(data.get("email") || "").trim(),
      phone: String(data.get("phone") || "").trim(),
      password,
      role: String(data.get("role") || "") as UserRole,
      privileges: data.getAll("privileges").map(String) as UserPrivilege[],
    };
    try {
      const createdUser = await createUserAccount(input, managementKey);
      setUsers((current) => [...current, createdUser].sort((first, second) =>
        `${first.firstName} ${first.lastName}`.localeCompare(`${second.firstName} ${second.lastName}`)
      ));
      form.reset();
      setIsCreating(false);
      onNotify(`User account created for ${createdUser.firstName} ${createdUser.lastName}.`);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Could not create user.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="user-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="user-directory-dialog" role="dialog" aria-modal="true" aria-labelledby="user-directory-title">
        <header className="user-directory-header">
          <div>
            <span className="eyebrow">{mode === "transfer" ? "LEAD OWNERSHIP" : "TEAM ACCESS"}</span>
            <h2 id="user-directory-title">{mode === "transfer" ? "Transfer lead" : "Manage users"}</h2>
          </div>
          <button className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={18} /></button>
        </header>

        {isCreating ? (
          <form className="user-create-form" onSubmit={submitUser}>
            <button className="text-button user-back-button" type="button" onClick={() => setIsCreating(false)}><ArrowLeft size={14} /> Back to users</button>
            <div className="user-form-grid">
              <label>First name<input name="firstName" autoComplete="given-name" required maxLength={80} /></label>
              <label>Last name<input name="lastName" autoComplete="family-name" required maxLength={80} /></label>
              <label>Email<input name="email" type="email" autoComplete="email" required maxLength={254} /></label>
              <label>Phone<input name="phone" type="tel" autoComplete="tel" maxLength={40} /></label>
              <label className="user-form-wide">Platform password
                <span className="user-password-input-wrap">
                  <input name="password" type={isPasswordVisible ? "text" : "password"} autoComplete="new-password" minLength={12} maxLength={200} required />
                  <button
                    className="user-key-visibility"
                    type="button"
                    aria-label={isPasswordVisible ? "Hide password" : "Show password"}
                    aria-pressed={isPasswordVisible}
                    onClick={() => setIsPasswordVisible((visible) => !visible)}
                  >
                    {isPasswordVisible ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </span>
                <small>Minimum 12 characters. The password is stored as a one-way scrypt hash.</small>
              </label>
              <label className="user-form-wide">Verify password<input name="confirmPassword" type="password" autoComplete="new-password" minLength={12} maxLength={200} required /></label>
              <label className="user-form-wide">Role<select name="role" defaultValue={initialAccount ? "Administrator" : "Sales Representative"}>{userRoles.map((role) => <option key={role}>{role}</option>)}</select></label>
            </div>
            <fieldset className="user-privileges">
              <legend>Privileges</legend>
              {userPrivileges.map((privilege) => (
                <label key={privilege.id}><input type="checkbox" name="privileges" value={privilege.id} defaultChecked={privilege.id === "view_leads" || (initialAccount && privilege.id === "manage_users")} />{privilege.label}</label>
              ))}
            </fieldset>
            {formError && <p className="user-form-error" role="alert">{formError}</p>}
            <div className="user-dialog-actions"><button className="button button-outline" type="button" onClick={() => setIsCreating(false)}>Cancel</button><button className="button button-primary" type="submit" disabled={isSaving}>{isSaving ? "Creating..." : "Create user"}</button></div>
          </form>
        ) : (
          <>
            {!hasAccess ? (
              <form className="user-access-form" onSubmit={authenticate}>
                <p>{mode === "manage"
                  ? "Sign in with an account that can manage users, or use the local bootstrap key to create the first platform account."
                  : "Sign in with an account that can transfer leads, or use the local bootstrap key if no platform account exists yet."}</p>
                <label>
                  User-management key
                  <span className="user-key-input-wrap">
                    <input type={isManagementKeyVisible ? "text" : "password"} autoComplete="current-password" value={keyInput} onChange={(event) => setKeyInput(event.target.value)} required />
                    <button
                      className="user-key-visibility"
                      type="button"
                      aria-label={isManagementKeyVisible ? "Hide user-management key" : "Show user-management key"}
                      aria-pressed={isManagementKeyVisible}
                      onClick={() => setIsManagementKeyVisible((visible) => !visible)}
                    >
                      {isManagementKeyVisible ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </span>
                </label>
                {loadError && <p className="user-form-error" role="alert">{loadError}</p>}
                <button className="button button-primary" type="submit">Continue</button>
              </form>
            ) : <>
            <div className="user-directory-toolbar">
              <p>{mode === "transfer" ? "Select a user to assign this lead." : "Platform accounts, roles, and access privileges."}</p>
              {mode === "manage" && <button className="button button-outline button-small" onClick={() => { setFormError(""); setIsCreating(true); }}><Plus size={14} /> Add user</button>}
            </div>
            {isLoading ? <p className="user-directory-message">Loading users...</p> :
              loadError ? <div className="user-directory-message"><p className="user-form-error" role="alert">{loadError}</p><button className="text-button" onClick={() => { setHasAccess(false); setManagementKey(""); setKeyInput(""); setLoadError(""); }}>Try another key</button></div> :
                users.length === 0 ? <div className="user-directory-empty"><UserRound size={22} /><strong>No platform users yet</strong><span>Add a user with their contact details, role, privileges, and platform password.</span></div> :
                  <div className="user-directory-list">
                    {users.map((user) => (
                      <article className="user-directory-row" key={user.id}>
                        <span className="user-directory-avatar">{user.firstName[0]}{user.lastName[0]}</span>
                        <div className="user-directory-details">
                          <strong>{user.firstName} {user.lastName}</strong>
                          <span>{user.email}</span>
                          <small>{user.phone || "No phone"} · {user.role}</small>
                          {mode === "manage" && <small>{user.privileges.length ? user.privileges.map((privilege) => userPrivileges.find((option) => option.id === privilege)?.label ?? privilege).join(", ") : "No privileges assigned"}</small>}
                        </div>
                        {mode === "transfer" && <button className="button button-outline button-small" onClick={() => onTransfer?.(user)}>Transfer to user</button>}
                      </article>
                    ))}
                  </div>}
            </>}
          </>
        )}
      </section>
    </div>
  );
}

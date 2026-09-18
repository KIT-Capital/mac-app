"use client";

import { FormEvent, useEffect, useState } from "react";
import { AdminChrome, AdminTable } from "@/components/admin-chrome";
import { Field, NativeSelect, PillButton } from "@/components/field";
import { sendAppEmail } from "@/lib/send-mail";
import { useStore } from "@/lib/store";
import type { ManagedUser, UserStatus } from "@/lib/types";

const BLANK: ManagedUser = {
  id: "",
  name: "",
  email: "",
  phone: "",
  role: "collector",
  status: "invited",
  member: false,
  lastActive: new Date().toISOString().slice(0, 10),
};

type StaffMember = {
  id: string;
  name: string;
  email: string;
  role: "staff" | "admin";
  mustRotate: boolean;
  disabledAt: string | null;
};

async function fetchStaffMembers() {
  const response = await fetch("/api/desk/staff", {
    cache: "no-store",
    credentials: "include",
  }).catch(() => null);
  const body = await response?.json().catch(() => null) as {
    mode?: "browser" | "live";
    members?: StaffMember[];
  } | null;
  return response?.ok && body?.mode ? body : null;
}

export default function AdminAccessPage() {
  const { users, upsertUser, removeUser, user } = useStore();
  const [draft, setDraft] = useState<ManagedUser>(BLANK);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [staffMode, setStaffMode] = useState<"browser" | "live" | null>(null);
  const [staffDraft, setStaffDraft] = useState({
    name: "",
    email: "",
    role: "staff" as "staff" | "admin",
  });
  const [temporaryPassword, setTemporaryPassword] = useState("");

  async function loadStaff() {
    if (user?.role !== "admin") return;
    const body = await fetchStaffMembers();
    if (!body?.mode) return;
    setStaffMode(body.mode);
    setStaff(body.members ?? []);
  }

  useEffect(() => {
    if (user?.role !== "admin") return;
    let current = true;
    void fetchStaffMembers().then((body) => {
      if (!current || !body?.mode) return;
      setStaffMode(body.mode);
      setStaff(body.members ?? []);
    });
    return () => {
      current = false;
    };
  }, [user?.role]);

  async function staffAction(body: Record<string, unknown>) {
    setError("");
    setTemporaryPassword("");
    const response = await fetch("/api/desk/staff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      credentials: "include",
    }).catch(() => null);
    const result = await response?.json().catch(() => null) as {
      error?: string;
      temporaryPassword?: string;
      warning?: string;
    } | null;
    if (!response?.ok) {
      setError(result?.error ?? "Staff account could not be changed.");
      return;
    }
    if (result?.temporaryPassword) setTemporaryPassword(result.temporaryPassword);
    if (result?.warning === "INVITE_EMAIL_FAILED") {
      setNotice("Staff account created. Hand over the temporary password; invite email failed.");
    }
    setStaffDraft({ name: "", email: "", role: "staff" });
    await loadStaff();
  }

  async function addStaff(event: FormEvent) {
    event.preventDefault();
    await staffAction({ action: "add", ...staffDraft });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!draft.name || !draft.email.includes("@")) return;
    const creating = !draft.id;
    setBusy(true);
    const saved = await upsertUser({ ...draft, id: draft.id || `usr-${Date.now()}` });
    if (!saved.ok) {
      setBusy(false);
      setNotice("");
      setError(saved.error || "User could not be saved.");
      return;
    }
    setError("");
    if (creating) {
      const result = await sendAppEmail({
        kind: "invite",
        name: draft.name,
        email: draft.email,
        role: draft.role,
        phone: draft.phone,
      });
      if (!result.ok) {
        setError(result.error || "User saved, but the invite email failed.");
        setNotice("");
      } else {
        setError("");
        setNotice(result.preview ? "User saved. Invite is in the preview outbox." : "Invite sent through Resend.");
      }
    }
    setBusy(false);
    setDraft(BLANK);
  }

  return (
    <AdminChrome title="Access management">
      <p className="mb-4 max-w-2xl text-sm text-white/55">
        Invite collectors to open their private collection.
      </p>
      <form onSubmit={onSubmit} className="mb-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Field label="Name">
          <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="w-full bg-transparent py-1 text-[16px] outline-none" />
        </Field>
        <Field label="Email">
          <input value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} className="w-full bg-transparent py-1 text-[16px] outline-none" />
        </Field>
        <Field label="Phone">
          <input value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} className="w-full bg-transparent py-1 text-[16px] outline-none" />
        </Field>
        <Field label="Status">
          <NativeSelect value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as UserStatus })}>
            <option className="bg-black" value="active">Active</option>
            <option className="bg-black" value="invited">Invited</option>
            <option className="bg-black" value="suspended">Suspended</option>
          </NativeSelect>
        </Field>
        <PillButton type="submit" variant="gold" disabled={busy}>
          {busy ? "Sending invite…" : draft.id ? "Update User" : "Invite User"}
        </PillButton>
      </form>
      {notice ? <p className="mb-4 text-sm text-[#FCB040]">{notice}</p> : null}
      {error ? <p className="mb-4 text-sm text-red-400">{error}</p> : null}
      <AdminTable
        headers={["Name", "Email", "Role", "Status", ""]}
        rows={users.map((u) => [
          u.name,
          u.email,
          u.role,
          u.status,
          <div key={u.id} className="flex gap-3 text-[#FCB040]">
            <button type="button" onClick={() => setDraft(u)}>Edit</button>
            <button type="button" onClick={() => void removeUser(u.id)}>Remove</button>
          </div>,
        ])}
      />

      {user?.role === "admin" && staffMode === "live" ? (
        <section className="mt-12 border-t border-white/10 pt-8">
          <h2 className="text-lg font-medium text-white">Desk staff</h2>
          <p className="mt-1 max-w-2xl text-sm text-white/55">
            Add, disable, or reset desk accounts. Temporary passwords appear once and must be
            handed over out of band.
          </p>
          {temporaryPassword ? (
            <div className="mt-4 border border-[#FCB040]/40 bg-[#FCB040]/10 p-4">
              <p className="text-xs tracking-[0.14em] text-[#FCB040] uppercase">
                Temporary password — shown once
              </p>
              <div className="mt-2 flex items-center gap-3">
                <code className="break-all text-sm text-white">{temporaryPassword}</code>
                <button
                  type="button"
                  onClick={() => void navigator.clipboard.writeText(temporaryPassword)}
                  className="text-xs font-semibold text-[#FCB040] underline"
                >
                  Copy
                </button>
                <button
                  type="button"
                  onClick={() => setTemporaryPassword("")}
                  className="text-xs text-white/60 underline"
                >
                  Dismiss
                </button>
              </div>
            </div>
          ) : null}
          <form onSubmit={addStaff} className="my-6 grid gap-4 md:grid-cols-3">
            <Field label="Name">
              <input
                value={staffDraft.name}
                onChange={(event) => setStaffDraft({ ...staffDraft, name: event.target.value })}
                className="w-full bg-transparent py-1 text-[16px] outline-none"
                required
              />
            </Field>
            <Field label="Email">
              <input
                type="email"
                value={staffDraft.email}
                onChange={(event) => setStaffDraft({ ...staffDraft, email: event.target.value })}
                className="w-full bg-transparent py-1 text-[16px] outline-none"
                required
              />
            </Field>
            <Field label="Role">
              <NativeSelect
                value={staffDraft.role}
                onChange={(event) => setStaffDraft({
                  ...staffDraft,
                  role: event.target.value as "staff" | "admin",
                })}
              >
                <option className="bg-black" value="staff">Staff</option>
                <option className="bg-black" value="admin">Admin</option>
              </NativeSelect>
            </Field>
            <PillButton type="submit" variant="gold">Add desk account</PillButton>
          </form>
          <AdminTable
            headers={["Name", "Email", "Role", "Status", ""]}
            rows={staff.map((member) => [
              member.name,
              member.email,
              member.role,
              member.disabledAt ? "disabled" : member.mustRotate ? "password change required" : "active",
              <div key={member.id} className="flex gap-3 text-[#FCB040]">
                <button
                  type="button"
                  onClick={() => void staffAction({
                    action: member.disabledAt ? "enable" : "disable",
                    id: member.id,
                  })}
                >
                  {member.disabledAt ? "Enable" : "Disable"}
                </button>
                <button
                  type="button"
                  onClick={() => void staffAction({ action: "reset", id: member.id })}
                >
                  Reset
                </button>
              </div>,
            ])}
          />
        </section>
      ) : null}
    </AdminChrome>
  );
}

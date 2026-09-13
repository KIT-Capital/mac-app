"use client";

import { FormEvent, useState } from "react";
import { AdminChrome, AdminTable } from "@/components/admin-chrome";
import { Field, NativeSelect, PillButton } from "@/components/field";
import { useStore } from "@/lib/store";
import type { ManagedUser, Role, UserStatus } from "@/lib/types";

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

export default function AdminAccessPage() {
  const { users, upsertUser, removeUser } = useStore();
  const [draft, setDraft] = useState<ManagedUser>(BLANK);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!draft.name || !draft.email.includes("@")) return;
    upsertUser({ ...draft, id: draft.id || `usr-${Date.now()}` });
    setDraft(BLANK);
  }

  return (
    <AdminChrome title="Access management">
      <p className="mb-4 max-w-2xl text-sm text-white/55">
        Invite collectors, desk staff, and administrators. Roles control whether someone sees the Vladimir
        collector app or this admin desk.
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
        <Field label="Role">
          <NativeSelect value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value as Role })}>
            <option className="bg-black" value="collector">Collector</option>
            <option className="bg-black" value="staff">Staff</option>
            <option className="bg-black" value="admin">Admin</option>
          </NativeSelect>
        </Field>
        <Field label="Status">
          <NativeSelect value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as UserStatus })}>
            <option className="bg-black" value="active">Active</option>
            <option className="bg-black" value="invited">Invited</option>
            <option className="bg-black" value="suspended">Suspended</option>
          </NativeSelect>
        </Field>
        <div className="flex items-end">
          <PillButton type="submit">{draft.id ? "Update user" : "Add user"}</PillButton>
        </div>
      </form>
      <AdminTable
        headers={["Name", "Email", "Role", "Status", ""]}
        rows={users.map((u) => [
          u.name,
          u.email,
          u.role,
          u.status,
          <div key={u.id} className="flex gap-3 text-[#FCB040]">
            <button type="button" onClick={() => setDraft(u)}>Edit</button>
            <button type="button" onClick={() => removeUser(u.id)}>Remove</button>
          </div>,
        ])}
      />
    </AdminChrome>
  );
}

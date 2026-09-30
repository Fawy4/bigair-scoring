"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ConfirmButton } from "@/components/confirm-button";
import { FieldLabel } from "@/components/help-button";
import { LogoField } from "@/components/org/logo-field";
import { toast } from "@/hooks/use-toast";
import { slugMatches } from "@/lib/platform/organisation";
import { copy } from "@/lib/ui-copy";
import { deleteOrganisation, inviteOrganiser, renameOrganisation, setOrganisationArchived, setOrganisationLogo, type InviteResult } from "../../actions";

const c = copy.admin.org;
const Problem = ({ text }: { text: string | null }) =>
  text ? (
    <p role="alert" className="panel field-error">
      {copy.common.problem(text)}
    </p>
  ) : null;

export function RenamePanel({ orgId, name: initial }: { orgId: string; name: string }) {
  const [name, setName] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <section className="flex flex-col gap-3" aria-labelledby="rename-h">
      <h2 id="rename-h" className="text-2xl font-extrabold">
        {c.renameHeading}
      </h2>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          start(async () => {
            const res = await renameOrganisation(orgId, name);
            if (res.ok) {
              toast({ title: c.renamed });
              router.refresh();
            } else setError(res.error);
          });
        }}
      >
        <div className="flex flex-col gap-1">
          <FieldLabel htmlFor="rename-name" text={c.renameLabel} />
          <input id="rename-name" value={name} onChange={(e) => setName(e.target.value)} disabled={pending} />
        </div>
        <Problem text={error} />
        <div>
          <button type="submit" className="btn btn-primary" disabled={pending || name.trim() === initial}>
            {c.renameButton}
          </button>
        </div>
      </form>
    </section>
  );
}

export function LogoPanel({ orgId, logoUrl }: { orgId: string; logoUrl: string | null }) {
  const [url, setUrl] = useState<string | null>(logoUrl);
  const [error, setError] = useState<string | null>(null);
  return (
    <section className="flex flex-col gap-3" aria-labelledby="logo-h">
      <h2 id="logo-h" className="text-2xl font-extrabold">
        {c.logoHeading}
      </h2>
      <LogoField
        orgId={orgId}
        purpose="organisation-logo"
        label={c.logo}
        value={url}
        onChange={async (next) => {
          setError(null);
          const res = await setOrganisationLogo(orgId, next);
          if (res.ok) {
            setUrl(next);
            toast({ title: c.logoSaved });
          } else setError(res.error);
        }}
      />
      <Problem text={error} />
    </section>
  );
}

export function InvitePanel({ orgId }: { orgId: string }) {
  const [email, setEmail] = useState("");
  const [send, setSend] = useState(true);
  const [result, setResult] = useState<InviteResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();

  return (
    <section className="flex flex-col gap-3" aria-labelledby="invite-h">
      <h2 id="invite-h" className="text-2xl font-extrabold">
        {c.inviteHeading}
      </h2>
      <p className="font-semibold">{c.inviteIntro}</p>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          setResult(null);
          setCopied(false);
          start(async () => {
            const res = await inviteOrganiser({ orgId, email, sendEmail: send });
            setResult(res);
            if (res.ok) {
              setEmail("");
              router.refresh();
            }
          });
        }}
      >
        <div className="flex flex-col gap-1">
          <FieldLabel htmlFor="invite-email" text={c.inviteEmail} />
          <input id="invite-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={pending} autoComplete="off" required />
        </div>
        <div className="flex flex-col gap-1">
          <label className="flex items-center gap-3 font-bold">
            <input type="checkbox" checked={send} onChange={(e) => setSend(e.target.checked)} disabled={pending} />
            {c.inviteSend}
          </label>
          <p className="text-sm font-semibold">{c.inviteSendHelp.text}</p>
        </div>
        <div>
          <button type="submit" className="btn btn-primary" disabled={pending || !email.trim()}>
            {pending ? c.inviting : c.inviteButton}
          </button>
        </div>
      </form>
      {result && !result.ok ? <Problem text={result.error} /> : null}
      {result && result.ok ? (
        <div className="panel flex flex-col gap-3" role="status">
          <p className="text-lg font-bold">
            {result.emailSent ? c.inviteSent(result.email) : result.emailFailed ? c.inviteEmailFailed(result.email) : c.inviteLinkOnly(result.email)}
          </p>
          {result.link ? (
            <div className="flex flex-col gap-2">
              <p className="text-lg font-extrabold">{c.linkHeading}</p>
              <label htmlFor="invite-link" className="font-bold">
                {c.linkLabel}
              </label>
              <input id="invite-link" readOnly value={result.link} onFocus={(e) => e.currentTarget.select()} />
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  className="btn"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(result.link!);
                      setCopied(true);
                    } catch {
                      setCopied(false);
                    }
                  }}
                >
                  {c.copy}
                </button>
                {copied ? <span className="font-bold">{c.copied}</span> : null}
              </div>
              <p className="text-sm font-semibold">{c.linkWarning}</p>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export function ArchivePanel({ orgId, name, archived }: { orgId: string; name: string; archived: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <section className="flex flex-col gap-3" aria-labelledby="archive-h">
      <h2 id="archive-h" className="text-2xl font-extrabold">
        {c.archiveHeading}
      </h2>
      <p className="font-semibold">{archived ? c.restoreText : c.archiveText}</p>
      <ConfirmButton
        label={archived ? c.restoreButton : c.archiveButton}
        question={archived ? c.confirmQuestionRestore(name) : c.confirmQuestionArchive(name)}
        confirmLabel={archived ? c.restoreYes : c.archiveYes}
        cancelLabel={c.cancel}
        pending={pending}
        onConfirm={() =>
          start(async () => {
            setError(null);
            const res = await setOrganisationArchived(orgId, !archived);
            if (res.ok) {
              toast({ title: archived ? c.restored : c.archived });
              router.refresh();
            } else setError(res.error);
          })
        }
      />
      <Problem text={error} />
    </section>
  );
}

export function DeletePanel({ orgId, name, slug, blocked, isOwner }: { orgId: string; name: string; slug: string; blocked: string | null; isOwner: boolean }) {
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const allowed = isOwner && !blocked;
  return (
    <section className="flex flex-col gap-3" aria-labelledby="delete-h">
      <h2 id="delete-h" className="text-2xl font-extrabold">
        {c.deleteHeading}
      </h2>
      <p className="font-semibold">{c.deleteText}</p>
      {blocked ? <p className="panel font-bold">{blocked}</p> : null}
      {!isOwner ? <p className="panel font-bold">{c.ownerOnlyDelete}</p> : null}
      <div className="flex flex-col gap-1">
        <FieldLabel htmlFor="delete-typed" text={c.deleteTyped} />
        <input id="delete-typed" value={typed} onChange={(e) => setTyped(e.target.value)} disabled={!allowed || pending} autoComplete="off" spellCheck={false} autoCapitalize="none" />
        <p className="text-sm font-semibold">{c.deleteTypedHint(slug)}</p>
      </div>
      <ConfirmButton
        danger
        label={c.deleteButton}
        question={c.deleteQuestion(name)}
        confirmLabel={c.deleteYes}
        cancelLabel={c.cancel}
        disabled={!allowed || !slugMatches(slug, typed)}
        pending={pending}
        onConfirm={() =>
          start(async () => {
            setError(null);
            const res = await deleteOrganisation(orgId, typed);
            if (res.ok) {
              toast({ title: c.deleted });
              router.push("/admin");
              router.refresh();
            } else setError(res.error);
          })
        }
      />
      <Problem text={error} />
    </section>
  );
}

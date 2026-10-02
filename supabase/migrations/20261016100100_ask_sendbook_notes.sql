-- Ask Sendbook: a note with the role 'official' is written by the server only (a PIN seat's "Was this right?" thumbs). The insert rule of
-- feedback_notes did not name the roles it allows, so an organiser could have written one; it now allows only the three roles a login can have.
drop policy if exists insert_own on public.feedback_notes;
create policy insert_own on public.feedback_notes for insert to authenticated
  with check (
    author_user_id = auth.uid()
    and author_role in ('owner', 'staff', 'organiser')
    and ((organisation_id is not null and private.is_org_member(organisation_id)) or (organisation_id is null and private.is_platform_admin()))
    and (author_role <> 'owner' or private.is_platform_owner())
    and (author_role <> 'staff' or private.is_platform_admin()));

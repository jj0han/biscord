-- Advisor follow-ups: trigger functions are not RPCs, and index the foreign
-- keys that joins and cascades actually hit.

revoke execute on function public.handle_new_user() from authenticated;
revoke execute on function public.messages_before_write() from authenticated;
revoke execute on function public.messages_after_insert() from authenticated;
revoke execute on function public.reactions_before_insert() from authenticated;

drop function if exists public.shares_server_with(uuid);

create index if not exists server_members_user_idx on public.server_members (user_id);
create index if not exists member_roles_role_idx on public.member_roles (role_id);
create index if not exists member_roles_member_idx on public.member_roles (server_id, user_id);
create index if not exists messages_author_idx on public.messages (author_id);
create index if not exists messages_reply_to_idx on public.messages (reply_to_id);
create index if not exists channels_parent_idx on public.channels (parent_id);
create index if not exists invites_server_idx on public.invites (server_id);
create index if not exists friendships_addressee_idx on public.friendships (addressee_id);
create index if not exists read_states_channel_idx on public.read_states (channel_id);

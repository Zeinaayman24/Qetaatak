-- the messages tab refreshes its unread counts live
alter publication supabase_realtime add table public.chat_reads;

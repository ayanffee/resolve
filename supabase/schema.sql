-- ── Profiles ──────────────────────────────────────────────────────────────────
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz default now()
);

alter table profiles enable row level security;

create policy "Users can read own profile"
  on profiles for select using (auth.uid() = id);

create policy "Users can insert own profile"
  on profiles for insert with check (auth.uid() = id);

create policy "Users can update own profile"
  on profiles for update using (auth.uid() = id);

-- ── Entries ───────────────────────────────────────────────────────────────────
create table if not exists entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  party_b_user_id uuid references auth.users(id) on delete set null,
  title text not null,
  invite_code text unique not null,
  status text default 'solo',
  party_a jsonb default '{}',
  party_b jsonb,
  group_chat jsonb default '[]',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table entries enable row level security;

-- Any authenticated user can read entries (needed for invite code lookup)
create policy "Authenticated users can read entries"
  on entries for select using (auth.uid() is not null);

create policy "Users can insert own entries"
  on entries for insert with check (auth.uid() = user_id);

-- Owner OR joined party can update
create policy "Owner or party B can update entries"
  on entries for update using (
    auth.uid() = user_id
    or auth.uid() = party_b_user_id
    or party_b_user_id is null
  );

-- ── Cards ─────────────────────────────────────────────────────────────────────
create table if not exists cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  body text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table cards enable row level security;

create policy "Users can manage own cards"
  on cards for all using (auth.uid() = user_id);

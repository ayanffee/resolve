import { supabase } from './supabase'

// ── Mappers ───────────────────────────────────────────────────────────────────

export const dbToEntry = (row) => ({
  id: row.id,
  title: row.title,
  inviteCode: row.invite_code,
  status: row.status,
  partyA: row.party_a,
  partyB: row.party_b,
  groupChat: row.group_chat || [],
  createdAt: new Date(row.created_at).getTime(),
})

export const entryToDb = (e, userId) => ({
  id: e.id,
  user_id: userId,
  title: e.title,
  invite_code: e.inviteCode,
  status: e.status,
  party_a: e.partyA,
  party_b: e.partyB,
  group_chat: e.groupChat || [],
  updated_at: new Date().toISOString(),
})

// ── Auth ──────────────────────────────────────────────────────────────────────

export async function signUp(email, password) {
  return supabase.auth.signUp({ email, password })
}

export async function signIn(email, password) {
  return supabase.auth.signInWithPassword({ email, password })
}

export async function signOut() {
  return supabase.auth.signOut()
}

export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession()
  return session
}

// ── Profiles ─────────────────────────────────────────────────────────────────

export async function getProfile(userId) {
  const { data } = await supabase.from('profiles').select('*').eq('id', userId).single()
  return data
}

export async function createProfile(userId, name) {
  const { error } = await supabase.from('profiles').insert({ id: userId, name })
  return !error
}

// ── Entries ──────────────────────────────────────────────────────────────────

export async function loadEntries(userId) {
  const { data } = await supabase
    .from('entries')
    .select('*')
    .or(`user_id.eq.${userId},party_b_user_id.eq.${userId}`)
    .order('created_at', { ascending: false })
  return (data || []).map(dbToEntry)
}

export async function insertEntry(entry, userId) {
  const { error } = await supabase.from('entries').insert(entryToDb(entry, userId))
  return !error
}

export async function updateEntry(entry, userId) {
  const { error } = await supabase
    .from('entries')
    .update(entryToDb(entry, userId))
    .eq('id', entry.id)
  return !error
}

export async function findEntryByCode(inviteCode) {
  const { data } = await supabase
    .from('entries')
    .select('*')
    .eq('invite_code', inviteCode.toUpperCase())
    .single()
  return data ? dbToEntry(data) : null
}

export async function joinEntry(entryId, userId, partyBData) {
  const { error } = await supabase
    .from('entries')
    .update({
      party_b_user_id: userId,
      party_b: partyBData,
      status: 'both',
      updated_at: new Date().toISOString(),
    })
    .eq('id', entryId)
  return !error
}

// ── Cards ─────────────────────────────────────────────────────────────────────

export async function loadCards(userId) {
  const { data } = await supabase
    .from('cards')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  return (data || []).map(row => ({
    id: row.id,
    body: row.body,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
  }))
}

export async function insertCard(card, userId) {
  const { error } = await supabase.from('cards').insert({
    id: card.id,
    user_id: userId,
    body: card.body,
    created_at: new Date(card.createdAt).toISOString(),
    updated_at: new Date(card.updatedAt).toISOString(),
  })
  return !error
}

export async function updateCard(card) {
  const { error } = await supabase
    .from('cards')
    .update({ body: card.body, updated_at: new Date(card.updatedAt).toISOString() })
    .eq('id', card.id)
  return !error
}

export async function deleteCard(id) {
  const { error } = await supabase.from('cards').delete().eq('id', id)
  return !error
}

import { supabase } from '../supabase'
import type { Faction } from '../../types'

// ─── Room shapes ──────────────────────────────────────────────────────────────
export interface RoomRow {
  id: string
  host_id: string
  host_faction: Faction
  code: string
  state: 'waiting' | 'active'
  guest_id?: string | null
  guest_faction?: string | null
}

// ── createRoom ────────────────────────────────────────────────────────────────
export async function createRoom(opts: {
  hostId: string
  hostFaction: Faction
  code: string
}): Promise<{ room: RoomRow | null; error: string | null }> {
  const { data, error } = await supabase
    .from('rooms')
    .insert({
      host_id: opts.hostId,
      host_faction: opts.hostFaction,
      code: opts.code,
      state: 'waiting',
    })
    .select()
    .single<RoomRow>()
  if (error || !data) return { room: null, error: error?.message ?? 'unknown error' }
  return { room: data, error: null }
}

// ── findRoomByCode ────────────────────────────────────────────────────────────
export async function findRoomByCode(code: string): Promise<RoomRow | null> {
  const { data, error } = await supabase
    .from('rooms')
    .select()
    .eq('code', code)
    .eq('state', 'waiting')
    .single<RoomRow>()
  if (error || !data) return null
  return data
}

// ── joinRoom ──────────────────────────────────────────────────────────────────
export async function joinRoom(
  roomId: string,
  opts: { guestId: string; guestFaction: Faction }
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('rooms')
    .update({
      guest_id: opts.guestId,
      guest_faction: opts.guestFaction,
      state: 'active',
    })
    .eq('id', roomId)
  return { error: error?.message ?? null }
}

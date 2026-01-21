import { supabase } from './supabase';

export interface LocalUser {
  id: string;
  name: string;
  created_at: string;
}

export async function fetchLocalUsers(): Promise<LocalUser[]> {
  const { data, error } = await supabase
    .from('local_users')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch local users: ${error.message}`);
  }

  return data || [];
}

export async function createLocalUser(name: string): Promise<LocalUser> {
  // Check if user with this name already exists
  const { data: existingUsers, error: checkError } = await supabase
    .from('local_users')
    .select('*')
    .eq('name', name)
    .limit(1);

  if (checkError) {
    throw new Error(`Failed to check for existing user: ${checkError.message}`);
  }

  if (existingUsers && existingUsers.length > 0) {
    return existingUsers[0];
  }

  // Create new user
  const { data, error } = await supabase
    .from('local_users')
    .insert([{ name }])
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create local user: ${error.message}`);
  }

  return data;
}

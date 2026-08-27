import { supabase } from './supabase';

// ==========================================
// 1. E-LEARNING (COURSE MATERIALS)
// ==========================================
export async function fetchCourseMaterials() {
  const { data, error } = await supabase
    .from('course_materials')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) console.error("Error fetching materials:", error);
  return data || [];
}

export async function addCourseMaterial(title: string, fileType: string, sizeMb: number) {
  const { data, error } = await supabase
    .from('course_materials')
    .insert([{ title, file_type: fileType, size_mb: sizeMb, icon_color: 'blue' }])
    .select();
  if (error) throw error;
  return data;
}

// ==========================================
// 2. ADMISSIONS PIPELINE (CRM)
// ==========================================
export async function fetchAdmissions() {
  const { data, error } = await supabase
    .from('admissions')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) console.error("Error fetching admissions:", error);
  return data || [];
}

export async function addApplicant(name: string, program: string, status: string = 'Under Review') {
  const { data, error } = await supabase
    .from('admissions')
    .insert([{ applicant_name: name, program, status }])
    .select();
  if (error) throw error;
  return data;
}

// ==========================================
// 3. FACILITIES & MAINTENANCE
// ==========================================
export async function fetchTickets() {
  const { data, error } = await supabase
    .from('maintenance_tickets')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) console.error("Error fetching tickets:", error);
  return data || [];
}

export async function createTicket(title: string, location: string, priority: string = 'Medium') {
  const { data, error } = await supabase
    .from('maintenance_tickets')
    .insert([{ issue_title: title, location, priority, status: 'Open' }])
    .select();
  if (error) throw error;
  return data;
}
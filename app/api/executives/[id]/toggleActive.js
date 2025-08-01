// pages/api/executives/[id]/toggleActive.js (example)

import { supabase } from '@/lib/supabaseServer';

export default async function handler(req, res) {
  const { id } = req.query;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Fetch current active status
  const { data: exec, error: fetchError } = await supabase
    .from('executives')
    .select('active')
    .eq('id', id)
    .single();

  if (fetchError) {
    return res.status(500).json({ error: 'Executive not found' });
  }

  const newActive = !exec.active;

  const { error: updateError } = await supabase
    .from('executives')
    .update({ active: newActive })
    .eq('id', id);

  if (updateError) {
    return res.status(500).json({ error: 'Failed to update active status' });
  }

  res.status(200).json({ id, active: newActive });
}

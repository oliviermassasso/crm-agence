const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://hmuhuokfbfpcnovmllti.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, payload, requesterId } = req.body;

  // Vérifier que le demandeur est bien direction
  const { data: requester } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', requesterId)
    .single();

  if (!requester || requester.role !== 'direction') {
    return res.status(403).json({ error: 'Accès refusé' });
  }

  try {
    if (action === 'create_user') {
      const { email, password, full_name, role } = payload;
      const { data, error } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (error) return res.status(400).json({ error: error.message });
      await supabase.from('profiles').insert({
        id: data.user.id,
        full_name,
        role,
      });
      return res.status(200).json({ success: true, user: data.user });
    }

    if (action === 'update_user') {
      const { userId, full_name, role, email, password } = payload;
      if (email || password) {
        const update = {};
        if (email) update.email = email;
        if (password) update.password = password;
        const { error } = await supabase.auth.admin.updateUserById(userId, update);
        if (error) return res.status(400).json({ error: error.message });
      }
      await supabase.from('profiles').update({ full_name, role }).eq('id', userId);
      return res.status(200).json({ success: true });
    }

    if (action === 'deactivate_user') {
      const { userId } = payload;
      // Bloquer la connexion Auth (ban 100 ans)
      try { await supabase.auth.admin.updateUserById(userId, { ban_duration: '876600h' }); } catch(e) {}
      await supabase.from('profiles').update({ actif: false }).eq('id', userId);
      return res.status(200).json({ success: true });
    }

    if (action === 'reactivate_user') {
      const { userId } = payload;
      // Débloquer la connexion Auth
      try { await supabase.auth.admin.updateUserById(userId, { ban_duration: 'none' }); } catch(e) {}
      await supabase.from('profiles').update({ actif: true }).eq('id', userId);
      return res.status(200).json({ success: true });
    }


    if (action === 'delete_user') {
      const { userId } = payload;
      // Tenter de supprimer le compte Auth (peut échouer si profil sans compte)
      try { await supabase.auth.admin.deleteUser(userId); } catch(e) {}
      await supabase.from('profiles').delete().eq('id', userId);
      return res.status(200).json({ success: true });
    }

    if (action === 'reset_password') {
      const { userId, password } = payload;
      const { error } = await supabase.auth.admin.updateUserById(userId, { password });
      if (error) return res.status(400).json({ error: error.message });
      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ error: 'Action inconnue' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};

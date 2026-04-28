const SB_URL = 'https://hmuhuokfbfpcnovmllti.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function sbFetch(path, method, body) {
  const res = await fetch(SB_URL + path, {
    method: method || 'GET',
    headers: {
      'apikey': SB_KEY,
      'Authorization': 'Bearer ' + SB_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  try { return { ok: res.ok, status: res.status, data: JSON.parse(text) }; }
  catch(e) { return { ok: res.ok, status: res.status, data: text }; }
}

async function authAdmin(path, method, body) {
  const res = await fetch(SB_URL + '/auth/v1/admin' + path, {
    method: method || 'GET',
    headers: {
      'apikey': SB_KEY,
      'Authorization': 'Bearer ' + SB_KEY,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  try { return { ok: res.ok, status: res.status, data: JSON.parse(text) }; }
  catch(e) { return { ok: res.ok, status: res.status, data: text }; }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { action, payload, requesterId } = req.body;

    const check = await sbFetch('/rest/v1/profiles?id=eq.' + requesterId + '&select=role', 'GET');
    if (!check.ok || !check.data || !check.data[0] || check.data[0].role !== 'direction') {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    if (action === 'list_users') {
      const r = await authAdmin('/users?per_page=1000', 'GET');
      if (!r.ok) return res.status(400).json({ error: 'Erreur chargement' });
      const emailMap = {};
      (r.data.users || []).forEach(function(u) { emailMap[u.id] = u.email; });
      return res.status(200).json({ emailMap });
    }

    if (action === 'create_user') {
      const { email, full_name, role } = payload;
      // Invitation par email — le collaborateur choisit son propre MDP
      const r = await authAdmin('/users', 'POST', {
        email,
        email_confirm: false,
        invite: true,
      });
      if (!r.ok) return res.status(400).json({ error: r.data.message || 'Erreur création' });
      await sbFetch('/rest/v1/profiles', 'POST', { id: r.data.id, full_name, role });
      return res.status(200).json({ success: true });
    }

    if (action === 'update_user') {
      const { userId, full_name, role, email } = payload;
      if (email) {
        const r = await authAdmin('/users/' + userId, 'PUT', { email });
        if (!r.ok) return res.status(400).json({ error: r.data.message || 'Erreur mise à jour' });
      }
      await sbFetch('/rest/v1/profiles?id=eq.' + userId, 'PATCH', { full_name, role });
      return res.status(200).json({ success: true });
    }

    if (action === 'deactivate_user') {
      const { userId } = payload;
      try { await authAdmin('/users/' + userId, 'PUT', { ban_duration: '876600h' }); } catch(e) {}
      await sbFetch('/rest/v1/profiles?id=eq.' + userId, 'PATCH', { actif: false });
      return res.status(200).json({ success: true });
    }

    if (action === 'reactivate_user') {
      const { userId } = payload;
      try { await authAdmin('/users/' + userId, 'PUT', { ban_duration: 'none' }); } catch(e) {}
      await sbFetch('/rest/v1/profiles?id=eq.' + userId, 'PATCH', { actif: true });
      return res.status(200).json({ success: true });
    }

    if (action === 'delete_user') {
      const { userId } = payload;
      try { await authAdmin('/users/' + userId, 'DELETE'); } catch(e) {}
      await sbFetch('/rest/v1/profiles?id=eq.' + userId, 'DELETE');
      return res.status(200).json({ success: true });
    }

    if (action === 'reset_password') {
      // Force un nouveau MDP par la direction
      const { userId, password } = payload;
      const r = await authAdmin('/users/' + userId, 'PUT', { password });
      if (!r.ok) return res.status(400).json({ error: r.data.message || 'Erreur reset' });
      return res.status(200).json({ success: true });
    }

    if (action === 'send_reset_email') {
      // Envoie un email de réinitialisation au collaborateur
      const { email } = payload;
      const r = await fetch(SB_URL + '/auth/v1/recover', {
        method: 'POST',
        headers: { 'apikey': SB_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ error: 'Action inconnue' });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};

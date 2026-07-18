// Fonction serveur (Vercel) — proxy d'envoi vers Discord.
//
// Pourquoi elle existe : les URLs de webhook Discord ne doivent PAS être dans le code client,
// où n'importe quel visiteur pourrait les lire et spammer le serveur Discord de la guilde.
// Elles vivent ici, en variables d'environnement, jamais envoyées au navigateur.
//
// Ce proxy :
//   1. vérifie que l'appelant est bien un membre connecté (jeton Supabase valide) ;
//   2. réserve les annonces publiques à l'administrateur ;
//   3. verrouille les mentions (aucun @everyone / @here possible, même en cas d'abus) ;
//   4. transmet le message à la bonne URL de webhook.
//
// Variables d'environnement à définir dans Vercel (Settings → Environment Variables) :
//   - DISCORD_WEBHOOK_URL        : le webhook du salon public de la guilde
//   - DISCORD_ADMIN_WEBHOOK_URL  : le webhook du salon privé des officiers

// Valeurs publiques (déjà présentes côté client, aucun secret) : servent à valider le jeton.
const SUPABASE_URL = "https://gpdayzjjwraoqdnpjdsb.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_fzLrzgOtdUTsboQCvUmV-w_fO5zHvMl";
const ADMIN_EMAIL = "admin@lespacifik.com";

// Seuls ces rôles peuvent être mentionnés (les 4 rôles utilisés par les notifications).
// Verrou de sécurité : même si un message contenait @everyone, Discord ne le déclencherait pas.
const ALLOWED_ROLE_IDS = [
    "1373212021306167369",
    "1373211423827693619",
    "1373208588796956814",
    "429892301272383489"
];

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'method_not_allowed' });
    }

    // 1) Authentification : l'appelant doit présenter un jeton Supabase valide
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!token) {
        return res.status(401).json({ error: 'missing_token' });
    }

    let user;
    try {
        const check = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
            headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` }
        });
        if (!check.ok) {
            return res.status(401).json({ error: 'invalid_token' });
        }
        user = await check.json();
    } catch (err) {
        return res.status(502).json({ error: 'auth_check_failed' });
    }
    const isAdmin = !!(user && user.email === ADMIN_EMAIL);

    // 2) Corps de la requête : { target: 'public' | 'admin', payload: {...} }
    let body = req.body;
    if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch (err) { body = null; }
    }
    if (!body || typeof body !== 'object') {
        return res.status(400).json({ error: 'invalid_body' });
    }

    const target = body.target;
    const payload = body.payload;

    if (target !== 'public' && target !== 'admin') {
        return res.status(400).json({ error: 'invalid_target' });
    }
    if (!payload || typeof payload !== 'object') {
        return res.status(400).json({ error: 'invalid_payload' });
    }

    // 3) Les annonces publiques (événement, enchère, rappel) sont réservées à l'admin.
    //    Le webhook admin (alerte "un membre a créé une activité") est ouvert aux membres.
    if (target === 'public' && !isAdmin) {
        return res.status(403).json({ error: 'admin_only' });
    }

    const webhookUrl = target === 'admin'
        ? process.env.DISCORD_ADMIN_WEBHOOK_URL
        : process.env.DISCORD_WEBHOOK_URL;

    if (!webhookUrl) {
        return res.status(500).json({ error: 'webhook_not_configured' });
    }

    // 4) On ne transmet QUE le texte et les embeds, et on impose allowed_mentions :
    //    seuls les rôles autorisés peuvent être notifiés, jamais tout le serveur.
    const safePayload = {
        allowed_mentions: { parse: [], roles: ALLOWED_ROLE_IDS, users: [] }
    };
    if (typeof payload.content === 'string') {
        safePayload.content = payload.content.slice(0, 2000);
    }
    if (Array.isArray(payload.embeds)) {
        safePayload.embeds = payload.embeds.slice(0, 10);
    }

    try {
        const discord = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(safePayload)
        });
        if (!discord.ok) {
            return res.status(502).json({ error: 'discord_error', status: discord.status });
        }
        return res.status(200).json({ ok: true });
    } catch (err) {
        return res.status(502).json({ error: 'discord_unreachable' });
    }
};

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

    // 2) Corps de la requête : { kind: '...', payload: {...} }
    let body = req.body;
    if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch (err) { body = null; }
    }
    if (!body || typeof body !== 'object') {
        return res.status(400).json({ error: 'invalid_body' });
    }

    const kind = body.kind;
    const payload = body.payload;

    // Chaque type de message : dans quel(s) salon(s), et faut-il être admin pour l'envoyer ?
    //   channel : 'public' (salon membres), 'admin' (salon officiers), 'both' (les deux).
    //   - event            : annonce publique d'activité (un membre peut la déclencher).
    //   - auction          : annonce d'enchère -> les deux salons (admin + membres).
    //   - auction_reminder : rappel d'enchère (bouton admin) -> les deux salons.
    //   - reminder         : relance d'inscription d'activité -> admin uniquement.
    //   - member_alert     : alerte aux officiers (un membre a créé une activité).
    const KINDS = {
        event:            { channel: 'public', adminOnly: false },
        auction:          { channel: 'both',   adminOnly: false },
        auction_reminder: { channel: 'both',   adminOnly: false },
        reminder:         { channel: 'public', adminOnly: true },
        member_alert:     { channel: 'admin',  adminOnly: false }
    };

    const rule = KINDS[kind];
    if (!rule) {
        return res.status(400).json({ error: 'invalid_kind' });
    }
    if (!payload || typeof payload !== 'object') {
        return res.status(400).json({ error: 'invalid_payload' });
    }
    if (rule.adminOnly && !isAdmin) {
        return res.status(403).json({ error: 'admin_only' });
    }

    // Le(s) webhook(s) cible(s) selon le salon voulu.
    const publicUrl = process.env.DISCORD_WEBHOOK_URL;
    const adminUrl = process.env.DISCORD_ADMIN_WEBHOOK_URL;
    let webhookUrls;
    if (rule.channel === 'admin') {
        webhookUrls = [adminUrl];
    } else if (rule.channel === 'both') {
        webhookUrls = [publicUrl, adminUrl];
    } else {
        webhookUrls = [publicUrl];
    }
    webhookUrls = webhookUrls.filter(Boolean); // on ignore un webhook non configuré

    if (webhookUrls.length === 0) {
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

    // On transmet à chaque salon ; on considère l'envoi réussi si AU MOINS un a abouti.
    const results = await Promise.all(webhookUrls.map(async (url) => {
        try {
            const discord = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(safePayload)
            });
            return discord.ok;
        } catch (err) {
            return false;
        }
    }));

    if (results.some(Boolean)) {
        return res.status(200).json({ ok: true, sent: results.filter(Boolean).length });
    }
    return res.status(502).json({ error: 'discord_error' });
};

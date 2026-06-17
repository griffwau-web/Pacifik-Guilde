// CONFIGURATION DU MASTER ADMIN
const ADMIN_EMAIL = "admin@lespacifik.com"; 

// URL DE WEBHOOK DISCORD
const DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/1515782385495445635/gnRrDhehmiMB6YQhxwBbWilITRpENcdjVDRW7Yj_hAOZqE29ETLbkgqtMrfA0iM3gVXE"; 

// LISTE DES ARMES DU JEU
const WEAPONS_LIST = ["Arbalète", "Bâton", "Épée bouclier", "Espadon", "Dague", "Orbe", "Lance", "Arc", "Grimoire", "Gantelet"];

// Variables d'état globales
let supabaseClient = null;
let pieChartInstance = null;
let barChartInstance = null;
let flatpickrInstance = null; 
let teamsChannel = null;      
let notificationsEnabled = true; 
let isFormActive = true; // État d'activation du formulaire public

let allDatabasePlayers = []; 
let allDatabaseMembers = []; 
let teamsData = [];         
let auctionsData = []; 

// Configuration par défaut des barèmes de points d'activité
let pointsConfig = {
    "PVP": 10,
    "Boss de guilde": 10,
    "Raid": 15,
    "Épreuve dimensionnelle": 10
};

// Variables temporaires pour suppression
let playerToDeleteId = null;
let playerToDeleteName = null;

// INITIALISATION SÉCURISÉE DU CLIENT SUPABASE
const SUPABASE_URL = "https://gpdayzjjwraoqdnpjdsb.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_fzLrzgOtdUTsboQCvUmV-w_fO5zHvMl";

if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} else {
    console.warn("Veuillez configurer Supabase avec vos clés d'API.");
}

// Normaliseur de texte ultra-robuste (insensible aux accents, NFC/NFD, espaces ou tirets)
function cleanCompareString(str) {
    if (!str) return "";
    return str
        .normalize("NFC")                  // Force la normalisation NFC des accents
        .toLowerCase()                     // Convertit en minuscules
        .replace(/[\u00a0\s]+/g, " ")      // Remplace les espaces insécables par des espaces simples
        .replace(/[’']/g, "'")             // Uniformise les apostrophes
        .replace(/[-–—]/g, "-")            // Uniformise tous les types de tirets
        .trim();
}

// Calculateur de bonus de points pour les épreuves dimensionnelles (Tiers 1 à 10)
function getDimensionalTierBonus(tierStr) {
    if (!tierStr) return 0;
    // Extraction du chiffre (ex: "Tier 8" -> 8)
    const match = tierStr.match(/\d+/);
    if (!match) return 0;
    const tier = parseInt(match[0], 10);

    if (tier >= 1 && tier <= 4) return 1;
    if (tier >= 5 && tier <= 7) return 2;
    if (tier === 8) return 3;
    if (tier === 9) return 5;
    if (tier === 10) return 10;
    return 0;
}

// Traduction des armes en icônes Questlog CDN
function getWeaponIcon(weaponName) {
    const mapping = {
        "Arbalète": "crossbow.webp",
        "Bâton": "staff.webp",
        "Épée bouclier": "sword.webp",
        "Espadon": "sword2h.webp",
        "Dague": "dagger.webp",
        "Orbe": "orb.webp",
        "Lance": "spear.webp",
        "Arc": "bow.webp",
        "Grimoire": "wand.webp"
    };
    const filename = mapping[weaponName];
    if (filename) {
        return `<img src="https://cdn.questlog.gg/throne-and-liberty/common/weapons/check/${filename}" alt="${weaponName}" class="w-5 h-5 object-contain inline-block shrink-0" title="${weaponName}">`;
    }
    return ""; 
}

// Rendu HTML d'icône dynamique d'équipement selon la Rareté
function getItemIconHTML(item) {
    if (!item) return "";
    let borderClass = "border-purple-500/30 bg-purple-500/10 text-purple-400";
    if (item.rarity === 'legendary') {
        borderClass = "border-red-500/30 bg-red-500/10 text-red-400";
    }
    
    let lucideName = "gem";
    if (item.type === 'weapon') {
        if (item.icon === 'bow' || item.icon === 'crossbow') lucideName = "crosshair";
        else if (item.icon === 'staff') lucideName = "wand-2";
        else if (item.icon === 'wand') lucideName = "book-open";
        else lucideName = "swords";
    } else if (item.type === 'armor') {
        lucideName = "shield";
    }
    
    return `<div class="w-7 h-7 flex items-center justify-center rounded-lg border ${borderClass} shrink-0">
                <i data-lucide="${lucideName}" class="w-4 h-4"></i>
            </div>`;
}

// Ajoutez cette fonction dans la liste de vos fonctions :
async function checkMonthlyWishReset() {
    if (!supabaseClient) return;
    const now = new Date();
    // Clé unique pour le mois actuel, ex: "2026-06"
    const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    try {
        const { data, error } = await supabaseClient
            .from('guild_teams')
            .select('data')
            .eq('id', 2)
            .single();

        if (data && data.data) {
            const settings = data.data;
            const lastReset = settings.lastWishReset || "";

            if (lastReset !== currentMonthKey) {
                console.log(`Changement de mois détecté (${currentMonthKey}). Restauration des jetons de souhaits...`);

                const { data: members, error: fetchErr } = await supabaseClient
                    .from('member_profiles')
                    .select('id');

                if (fetchErr) throw fetchErr;

                if (members && members.length > 0) {
                    const resetPromises = members.map(m => 
                        supabaseClient
                            .from('member_profiles')
                            .update({ wish_tokens: 2 })
                            .eq('id', m.id)
                    );
                    await Promise.all(resetPromises);
                }

                settings.lastWishReset = currentMonthKey;
                await supabaseClient
                    .from('guild_teams')
                    .update({ data: settings })
                    .eq('id', 2);

                console.log("Restauration mensuelle automatique des souhaits effectuée.");
            }
        }
    } catch (err) {
        console.error("Erreur lors de la vérification de réinitialisation mensuelle :", err);
    }
}

// Trouver un équipement par son nom (avec comparaison de texte sécurisée)
function findItemByName(name) {
    if (!name) return null;
    const cleanSearchName = cleanCompareString(name);
    return TL_ITEMS_DB.find(item => item && cleanCompareString(item.name) === cleanSearchName) || null;
}

// Moteur d'autocomplétion dynamique pour les suggestions d'objets
function showItemSuggestions(inputElement, containerId) {
    const query = inputElement.value.trim().toLowerCase();
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!query) {
        container.classList.add('hidden');
        container.innerHTML = '';
        return;
    }

    const matches = TL_ITEMS_DB.filter(item => item.name.toLowerCase().includes(query));

    if (matches.length === 0) {
        container.classList.add('hidden');
        container.innerHTML = '';
        return;
    }

    container.classList.remove('hidden');
    container.innerHTML = matches.map(item => {
        const iconHtml = getItemIconHTML(item);
        const rarityBadge = item.rarity === 'legendary' 
            ? `<span class="text-[9px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20 uppercase font-bold">Légendaire</span>`
            : `<span class="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20 uppercase font-bold">Épique ${item.tier || ''}</span>`;

        return `
            <div onclick="selectItemSuggestion('${inputElement.id}', '${containerId}', '${item.name.replace(/'/g, "\\'")}')" class="p-2 flex items-center justify-between gap-3 hover:bg-[#161b26] cursor-pointer transition select-none">
                <div class="flex items-center gap-2">
                    ${iconHtml}
                    <span class="text-xs font-semibold text-slate-200">${item.name}</span>
                </div>
                ${rarityBadge}
            </div>
        `;
    }).join('');

    lucide.createIcons();
}

function selectItemSuggestion(inputId, containerId, itemName) {
    const input = document.getElementById(inputId);
    const container = document.getElementById(containerId);
    if (input) input.value = itemName;
    if (container) {
        container.classList.add('hidden');
        container.innerHTML = '';
    }
}

// Fermeture automatique des dropdowns au clic extérieur
document.addEventListener('click', function(event) {
    const containers = ['auction-suggestions', 'wishlist-suggestions-0', 'wishlist-suggestions-1', 'wishlist-suggestions-2'];
    containers.forEach(id => {
        const container = document.getElementById(id);
        if (container && !container.contains(event.target) && !event.target.classList.contains('w-full')) {
            container.classList.add('hidden');
        }
    });
});

// Masquer une partie de l'adresse e-mail pour garantir la confidentialité
function maskEmail(email) {
    if (!email) return "";
    const parts = email.split('@');
    if (parts.length !== 2) return email;
    const mailbox = parts[0];
    const domain = parts[1];
    
    let maskedMailbox = mailbox.length > 2 
        ? mailbox.substring(0, 2) + "***" + mailbox.substring(mailbox.length - 1)
        : mailbox[0] + "***";
        
    const domainParts = domain.split('.');
    let maskedDomain = domain;
    if (domainParts.length >= 2) {
        const domainName = domainParts[0];
        const tld = domainParts.slice(1).join('.');
        let maskedDomainName = domainName.length > 2
            ? domainName[0] + "***" + domainName[domainName.length - 1]
            : domainName[0] + "***";
        maskedDomain = maskedDomainName + "." + tld;
    }
    return maskedMailbox + "@" + maskedDomain;
}

// Envoi de la notification d'événement sur Discord via Webhook
async function sendDiscordNotification(name, dateVal, motif, gsLimit) {
    if (!DISCORD_WEBHOOK_URL || DISCORD_WEBHOOK_URL.trim() === "" || DISCORD_WEBHOOK_URL.includes("VOTRE_WEBHOOK")) {
        console.log("Notification Discord ignorée : Aucun Webhook configuré.");
        return;
    }

    let embedColor = 3899382; // Bleu Pacifique par défaut
    if (motif === "PVP") {
        embedColor = 10181046; // Violet
    } else if (motif === "Boss de guilde") {
        embedColor = 15579915; // Ambre/Or
    } else if (motif.includes("Raid")) {
        if (motif.includes("Nightmare")) {
            embedColor = 8388736; // Violet (Nightmare)
        } else if (motif.includes("Hardcore")) {
            embedColor = 12595240; // Rouge Foncé (Hardcore)
        } else {
            embedColor = 16724821; // Rose/Rouge Pacifique (Normal)
        }
    } else if (motif.includes("Épreuve dimensionnelle")) {
        embedColor = 1047423; // Cyan pour l'épreuve dimensionnelle
    }

    const eventName = name && name.trim() !== "" ? name : "Activité sans titre";
    const eventDate = formatEventDate(dateVal) && formatEventDate(dateVal).trim() !== "" ? formatEventDate(dateVal) : "Date non spécifiée";
    const eventMotif = motif && motif.trim() !== "" ? motif : "Non spécifié";

    const payload = {
        embeds: [{
            title: `🚀 Nouvelle Activité : ${eventName}`,
            description: `Pour Postuler dans l'équipe allez sur votre espace membre ici : https://pacifik-guilde.vercel.app/`,
            color: embedColor,
            fields: [
                { name: "Motif / Type", value: eventMotif, inline: true },
                { name: "GearScore Requis", value: gsLimit > 0 ? `${gsLimit} GS` : "Aucun", inline: true },
                { name: "Date & Heure", value: eventDate, inline: false }
            ],
            footer: {
                text: "Guilde Les Pacific"
            },
            timestamp: new Date().toISOString()
        }]
    };

    try {
        const response = await fetch(DISCORD_WEBHOOK_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) throw new Error(`Code HTTP ${response.status}`);
        console.log("Notification Discord d'événement envoyée avec succès.");
    } catch (err) {
        console.error("Échec de l'envoi Discord :", err);
    }
}

// Envoi de la notification de lancement d'enchère sur Discord via Webhook
async function sendDiscordAuctionNotification(itemName, endTime) {
    if (!DISCORD_WEBHOOK_URL || DISCORD_WEBHOOK_URL.trim() === "" || DISCORD_WEBHOOK_URL.includes("VOTRE_WEBHOOK")) {
        console.log("Notification Discord d'enchère ignorée : Aucun Webhook configuré.");
        return;
    }

    const formattedEnd = formatEventDate(endTime);
    const itemObj = findItemByName(itemName);
    let embedColor = 16753920; // Or par défaut pour les enchères
    
    // Si l'objet est identifié comme légendaire, l'embed s'affiche en rouge
    if (itemObj && itemObj.rarity === 'legendary') {
        embedColor = 16711680;
    }

    const payload = {
        embeds: [{
            title: `🔥 Nouvelle Enchère de Guilde : ${itemName}`,
            description: `Pour participer à l'enchère allez sur votre espace membre ici : https://pacifik-guilde.vercel.app/`,
            color: embedColor,
            fields: [
                { name: "Objet mis en jeu", value: itemName, inline: true },
                { name: "Date de Clôture", value: formattedEnd, inline: true }
            ],
            footer: {
                text: "Guilde Les Pacific"
            },
            timestamp: new Date().toISOString()
        }]
    };

    try {
        const response = await fetch(DISCORD_WEBHOOK_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) throw new Error(`Code HTTP ${response.status}`);
        console.log("Notification Discord d'enchère envoyée avec succès.");
    } catch (err) {
        console.error("Échec de l'envoi d'enchère sur Discord :", err);
    }
}

// Formater l'affichage des dates des événements
function formatEventDate(dateStr) {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function determineLevel(score) {
    if (score >= 7 && score <= 12) return "Niveau normal";
    if (score >= 13 && score <= 18) return "Niveau moyen";
    if (score >= 19 && score <= 24) return "Haut niveau";
    if (score >= 25 && score <= 28) return "Très haut niveau";
    return "Indéterminé";
}

// Traduction des options pour l'affichage de la fiche d'informations
const QUESTIONS_MAPPING = {
    q1: {
        title: "1. Connaissance des mécaniques du jeu",
        options: {
            1: "A. Je découvre encore certaines bases.",
            2: "B. Je maîtrise les mécaniques principales.",
            3: "C. Je connais très bien toutes les mécaniques importantes.",
            4: "D. Je maîtrise les mécaniques avancées et j'aide les autres à les comprendre."
        }
    },
    q2: {
        title: "2. Temps de jeu disponible par semaine",
        options: {
            1: "A. Moins de 5 heures.",
            2: "B. Entre 5 et 10 heures.",
            3: "C. Entre 10 et 20 heures.",
            4: "D. Plus de 20 heures."
        }
    },
    q3: {
        title: "3. Réactivité et adaptation aux nouvelles stratégies",
        options: {
            1: "A. J'ai besoin de temps pour m'adapter.",
            2: "B. Je m'adaptes après quelques essais.",
            3: "C. Je m'adapte rapidement.",
            4: "D. Je trouve souvent les meilleures stratégies avant les autres."
        }
    },
    q4: {
        title: "4. Optimisation de mon personnage / équipement",
        options: {
            1: "A. Peu optimisé.",
            2: "B. Correctement optimisé.",
            3: "C. Très bien optimisé.",
            4: "D. Optimisation maximale recherchée en permanence."
        }
    },
    q5: {
        title: "5. Gestion des contenus difficiles",
        options: {
            1: "A. Je préfère les contenus simples.",
            2: "B. Je réussis les contenus intermédiaires.",
            3: "C. Je participe régulièrement aux contenus difficiles.",
            4: "D. Je recherche les défis les plus exigeants du jeu."
        }
    },
    q6: {
        title: "6. Travail en équipe",
        options: {
            1: "A. Je joue surtout de façon détendue.",
            2: "B. Je suis les consignes quand elles sont données.",
            3: "C. Je communique activement et coordonne mon équipe.",
            4: "D. Je peux prendre un rôle de leader ou de stratège."
        }
    },
    q7: {
        title: "7. Motivation pour la nouvelle mise à jour",
        options: {
            1: "A. Je veux surtout découvrir le contenu.",
            2: "B. Je souhaite progresser tranquillement.",
            3: "C. Je vise les récompenses et les succès importants.",
            4: "D. Je vise les classements, records ou contenus élite."
        }
    }
};

// Événement au chargement de la page
window.addEventListener('DOMContentLoaded', async () => {
    lucide.createIcons();
    loadTeamsFromStorage();
    loadPointsConfig();
    
    flatpickrInstance = flatpickr("#event-date", {
        enableTime: true,
        dateFormat: "Y-m-d H:i",
        locale: "fr",
        time_24hr: true,
        minuteIncrement: 5,
        allowInput: true 
    });

    flatpickr("#auction-end-time", {
        enableTime: true,
        dateFormat: "Y-m-d H:i",
        locale: "fr",
        time_24hr: true,
        minuteIncrement: 5,
        allowInput: true 
    });

    const motifSelect = document.getElementById('event-motif');
    const diffContainer = document.getElementById('raid-difficulty-container');
    const diffSelect = document.getElementById('event-raid-difficulty');
    const tierContainer = document.getElementById('dimensional-tier-container');
    const tierSelect = document.getElementById('event-dimensional-tier');

    if (motifSelect) {
        motifSelect.addEventListener('change', function() {
            diffContainer?.classList.add('hidden');
            if (diffSelect) diffSelect.required = false;
            tierContainer?.classList.add('hidden');
            if (tierSelect) tierSelect.required = false;

            if (this.value === 'Raid') {
                diffContainer?.classList.remove('hidden');
                if (diffSelect) diffSelect.required = true;
            } else if (this.value === 'Épreuve dimensionnelle') {
                tierContainer?.classList.remove('hidden');
                if (tierSelect) tierSelect.required = true;
            }
        });
    }

    const storedNotif = localStorage.getItem('lespacific_notif_enabled');
    if (storedNotif !== null) {
        notificationsEnabled = (storedNotif === 'true');
    } else {
        notificationsEnabled = true;
    }
    updateNotifToggleButton();
    
    // Écouteur d'état d'authentification Supabase (Gère la connexion et l'abonnement RLS en temps réel)
    if (supabaseClient) {
        supabaseClient.auth.onAuthStateChange(async (event, session) => {
            console.log("Changement d'état d'authentification :", event);
            updateUIVisibility(session);
            subscribeToRealtimeTeams(); // Ré-abonne le WebSocket avec les bons privilèges RLS
            await checkMonthlyWishReset();
            
            if (session) {
                if (session.user.email === ADMIN_EMAIL) {
                    switchView('dashboard');
                } else {
                    switchView('members');
                }
            } else {
                // Redirection par défaut si non connecté
                const urlParams = new URLSearchParams(window.location.search);
                const inviteToken = urlParams.get('invite');
                if (inviteToken) {
                    verifyAndShowInvite(inviteToken);
                } else {
                    switchView('form');
                }
            }
        });
    }
});

// Lecture de l'activation du formulaire
async function loadFormStatus() {
    const stored = localStorage.getItem('lespacific_form_active');
    if (stored !== null) {
        isFormActive = (stored === 'true');
    }
    updateFormStatusUI();

    if (supabaseClient) {
        try {
            const { data, error } = await supabaseClient
                .from('guild_teams')
                .select('data')
                .eq('id', 2)
                .single();
            if (data && data.data) {
                isFormActive = data.data.formActive;
                localStorage.setItem('lespacific_form_active', isFormActive);
                updateFormStatusUI();
            }
        } catch (err) {
            console.log("Lecture de configuration Supabase indisponible, utilisation du cache.");
        }
    }
}

// Basculement de l'état d'activation du formulaire
async function toggleFormStatus() {
    isFormActive = !isFormActive;
    localStorage.setItem('lespacific_form_active', isFormActive);
    updateFormStatusUI();

    if (supabaseClient) {
        try {
            await supabaseClient
                .from('guild_teams')
                .upsert({ id: 2, data: { formActive: isFormActive } });
        } catch (err) {
            console.error("Échec de synchronisation du formulaire :", err);
        }
    }
}

// Mise à jour de l'affichage de l'état du formulaire
function updateFormStatusUI() {
    const btnToggleForm = document.getElementById('btn-toggle-form');
    const navFormBtn = document.getElementById('nav-form');

    if (btnToggleForm) {
        if (isFormActive) {
            btnToggleForm.className = "flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold bg-emerald-950/40 hover:bg-emerald-900/40 text-emerald-400 border border-emerald-900/30 transition";
            btnToggleForm.innerHTML = `<i data-lucide="check-circle" class="w-3.5 h-3.5 text-emerald-400"></i> Formulaire : ACTIF`;
        } else {
            btnToggleForm.className = "flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold bg-red-950/40 hover:bg-red-900/40 text-red-400 border border-red-900/30 transition";
            btnToggleForm.innerHTML = `<i data-lucide="lock" class="w-3.5 h-3.5 text-red-400"></i> Formulaire : FERMÉ`;
        }
    }

    if (navFormBtn) {
        if (isFormActive) {
            navFormBtn.classList.remove('hidden');
        } else {
            navFormBtn.classList.add('hidden');
            // Redirection de sécurité automatique vers Connexion si on tente de forcer la vue fermée
            const formSection = document.getElementById('view-form');
            if (formSection && !formSection.classList.contains('hidden')) {
                switchView('login');
            }
        }
    }
    lucide.createIcons();
}

// Lecture des configurations de points
function loadPointsConfig() {
    const stored = localStorage.getItem('lespacific_points_config');
    if (stored) {
        pointsConfig = JSON.parse(stored);
    }
    document.getElementById('config-pts-epreuve').value = pointsConfig["Épreuve dimensionnelle"] || 10;
    document.getElementById('config-pts-pvp').value = pointsConfig["PVP"] || 10;
    document.getElementById('config-pts-boss').value = pointsConfig["Boss de guilde"] || 10;
    document.getElementById('config-pts-raid').value = pointsConfig["Raid"] || 15;
}

function enablePointsConfigEdit() {
    document.getElementById('config-pts-epreuve').disabled = false;
    document.getElementById('config-pts-pvp').disabled = false;
    document.getElementById('config-pts-boss').disabled = false;
    document.getElementById('config-pts-raid').disabled = false;

    document.getElementById('btn-edit-pts').classList.add('hidden');
    document.getElementById('btn-save-pts').classList.remove('hidden');
}

function savePointsConfig() {
    pointsConfig["Épreuve dimensionnelle"] = parseInt(document.getElementById('config-pts-epreuve').value, 10) || 10;
    pointsConfig["PVP"] = parseInt(document.getElementById('config-pts-pvp').value, 10) || 10;
    pointsConfig["Boss de guilde"] = parseInt(document.getElementById('config-pts-boss').value, 10) || 10;
    pointsConfig["Raid"] = parseInt(document.getElementById('config-pts-raid').value, 10) || 15;

    localStorage.setItem('lespacific_points_config', JSON.stringify(pointsConfig));

    document.getElementById('config-pts-epreuve').disabled = true;
    document.getElementById('config-pts-pvp').disabled = true;
    document.getElementById('config-pts-boss').disabled = true;
    document.getElementById('config-pts-raid').disabled = true;

    document.getElementById('btn-save-pts').classList.add('hidden');
    document.getElementById('btn-edit-pts').classList.remove('hidden');

    alert("Configuration du barème de points sauvegardée.");
    lucide.createIcons();
}

function toggleNotifications() {
    notificationsEnabled = !notificationsEnabled;
    localStorage.setItem('lespacific_notif_enabled', notificationsEnabled);
    updateNotifToggleButton();
}

function updateNotifToggleButton() {
    const btn = document.getElementById('btn-toggle-notif');
    if (!btn) return;
    if (notificationsEnabled) {
        btn.className = "flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-emerald-950/40 hover:bg-emerald-900/40 text-emerald-400 border border-emerald-900/30 transition";
        btn.innerHTML = `<i data-lucide="bell" class="w-3.5 h-3.5 text-emerald-400"></i> Notification ON`;
    } else {
        btn.className = "flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-red-950/40 hover:bg-red-900/40 text-red-400 border border-red-900/30 transition";
        btn.innerHTML = `<i data-lucide="bell-off" class="w-3.5 h-3.5 text-red-400"></i> Notification OFF`;
    }
    lucide.createIcons();
}

// Écoute dynamique temps réel multi-tables (Équipes, Enchères et Profils)
function subscribeToRealtimeTeams() {
    if (!supabaseClient) return;

    if (teamsChannel) {
        supabaseClient.removeChannel(teamsChannel);
    }

    teamsChannel = supabaseClient
        .channel('public:guild_changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'guild_teams' }, async (payload) => {
            console.log("Mise à jour d'équipe reçue en direct :", payload);
            await handleLiveUpdate();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'auctions' }, async (payload) => {
            console.log("Mise à jour d'enchère reçue en direct :", payload);
            await handleLiveUpdate();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'member_profiles' }, async (payload) => {
            console.log("Mise à jour de profil reçue en direct :", payload);
            await handleLiveUpdate();
        })
        .subscribe();
}

// Fonction de centralisation des mises à jour en direct
async function handleLiveUpdate() {
    await loadFormStatus(); // Synchronise l'état d'ouverture/fermeture du formulaire pour tout le monde

    const dashboardSection = document.getElementById('view-dashboard');
    if (dashboardSection && !dashboardSection.classList.contains('hidden')) {
        await loadDashboardData();
    }

    const membersSection = document.getElementById('view-members');
    if (membersSection && !membersSection.classList.contains('hidden')) {
        await loadMembersViewData();
    }
}

function updateUIVisibility(session) {
    const navLogin = document.getElementById('nav-login');
    const navMembers = document.getElementById('nav-members');
    const navDashboard = document.getElementById('nav-dashboard');
    const btnLogout = document.getElementById('btn-logout');

    if (session) {
        navLogin?.classList.add('hidden');
        btnLogout?.classList.remove('hidden');

        if (session.user.email === ADMIN_EMAIL) {
            navDashboard?.classList.remove('hidden');
            navMembers?.classList.add('hidden');
        } else {
            navMembers?.classList.remove('hidden');
            navDashboard?.classList.add('hidden');
        }
    } else {
        navLogin?.classList.remove('hidden');
        navMembers?.classList.add('hidden');
        navDashboard?.classList.add('hidden');
        btnLogout?.classList.add('hidden');
    }
    lucide.createIcons();
}

function setTabActive(tabId, isActive) {
    const tab = document.getElementById(tabId);
    if (!tab) return;
    if (isActive) {
        tab.classList.remove('bg-[#161b26]', 'text-slate-300', 'border-[#252f44]');
        tab.classList.add('bg-blue-600', 'text-white', 'border-transparent', 'shadow-md', 'shadow-blue-900/20');
    } else {
        tab.classList.remove('bg-blue-600', 'text-white', 'border-transparent', 'shadow-md', 'shadow-blue-900/20');
        tab.classList.add('bg-[#161b26]', 'text-slate-300', 'border-[#252f44]');
    }
}

async function loadTeamsFromStorage() {
    const stored = localStorage.getItem('lespacific_teams');
    if (stored) {
        teamsData = JSON.parse(stored);
    } else {
        teamsData = [
            { id: "team-1", name: "Équipe 1", date: "", motif: "PVP", players: [] }
        ];
    }

    if (supabaseClient) {
        try {
            const { data, error } = await supabaseClient
                .from('guild_teams')
                .select('data')
                .eq('id', 1)
                .single();
            if (data && data.data) {
                teamsData = data.data;
                localStorage.setItem('lespacific_teams', JSON.stringify(teamsData));
            }
        } catch (err) {
            console.log("Lecture des équipes synchronisées indisponible.");
        }
    }
}

async function saveTeamsState() {
    localStorage.setItem('lespacific_teams', JSON.stringify(teamsData));
    if (supabaseClient) {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (session) { 
            try {
                await supabaseClient
                    .from('guild_teams')
                    .upsert({ id: 1, data: teamsData });
            } catch (err) {
                console.error("Échec de la synchronisation des équipes :", err);
            }
        }
    }
}

// Routage et affichage des vues privées
function switchView(view) {
    // Sécurité de routage : si le formulaire est désactivé, on redirige vers l'onglet Connexion
    if (view === 'form' && !isFormActive) {
        view = 'login';
    }

    const formSection = document.getElementById('view-form');
    const loginSection = document.getElementById('view-login');
    const dashboardSection = document.getElementById('view-dashboard');
    const membersSection = document.getElementById('view-members');
    const inviteSignupSection = document.getElementById('view-invite-signup');

    setTabActive('nav-form', view === 'form');
    setTabActive('nav-login', view === 'login');
    setTabActive('nav-dashboard', view === 'dashboard');
    setTabActive('nav-members', view === 'members');

    formSection?.classList.add('hidden');
    loginSection?.classList.add('hidden');
    dashboardSection?.classList.add('hidden');
    membersSection?.classList.add('hidden');
    inviteSignupSection?.classList.add('hidden');

    if (view === 'form') {
        formSection?.classList.remove('hidden');
    } else if (view === 'login') {
        loginSection?.classList.remove('hidden');
    } else if (view === 'dashboard') {
        dashboardSection?.classList.remove('hidden');
        switchDbSection('management'); 
        loadDashboardData(); // Chargement unique à l'ouverture de l'onglet
    } else if (view === 'members') {
        membersSection?.classList.remove('hidden');
        loadMembersViewData(); // Chargement unique à l'ouverture de l'onglet
    } else if (view === 'signup') {
        inviteSignupSection?.classList.remove('hidden');
    }
}

function switchDbSection(section) {
    const mgmtSec = document.getElementById('db-section-management');
    const resSec = document.getElementById('db-section-results');
    const mgmtTab = document.getElementById('subnav-management');
    const resTab = document.getElementById('subnav-results');

    if (section === 'management') {
        mgmtSec?.classList.remove('hidden');
        resSec?.classList.add('hidden');

        mgmtTab?.classList.add('border-blue-500', 'text-white');
        mgmtTab?.classList.remove('border-transparent', 'text-slate-400');
        
        resTab?.classList.add('border-transparent', 'text-slate-400');
        resTab?.classList.remove('border-blue-500', 'text-white');
    } else {
        resSec?.classList.remove('hidden');
        mgmtSec?.classList.add('hidden');

        resTab?.classList.add('border-blue-500', 'text-white');
        resTab?.classList.remove('border-transparent', 'text-slate-400');

        mgmtTab?.classList.add('border-transparent', 'text-slate-400');
        mgmtTab?.classList.remove('border-blue-500', 'text-white');

        if (allDatabasePlayers && allDatabasePlayers.length > 0) {
            const levelsDistribution = {
                "Niveau normal": 0,
                "Niveau moyen": 0,
                "Haut niveau": 0,
                "Très haut niveau": 0
            };
            allDatabasePlayers.forEach(p => {
                if (levelsDistribution[p.calculated_level] !== undefined) {
                    levelsDistribution[p.calculated_level]++;
                }
            });
            const topPlayers = allDatabasePlayers.slice(0, 10);
            renderCharts(levelsDistribution, topPlayers);
        }
    }
    lucide.createIcons();
}

async function verifyAndShowInvite(token) {
    try {
        const { data, error } = await supabaseClient
            .from('invitations')
            .select('*')
            .eq('token', token)
            .eq('used', false)
            .single();

        if (error || !data) {
            alert("L'invitation est invalide, expirée ou a déjà été consommée.");
            window.location.href = window.location.origin + window.location.pathname;
            return;
        }

        const expiresAt = new Date(data.expires_at);
        if (expiresAt < new Date()) {
            alert("Ce lien d'invitation a expiré (validité de 24h dépassée).");
            window.location.href = window.location.origin + window.location.pathname;
            return;
        }

        document.getElementById('invite-token-holder').value = token;
        switchView('signup');
    } catch (err) {
        console.error(err);
        alert("Erreur lors de la vérification de l'invitation.");
    }
}

async function handleInviteSignupSubmit(event) {
    event.preventDefault();
    const email = document.getElementById('signup-email').value.trim();
    const password = document.getElementById('signup-password').value;
    const token = document.getElementById('invite-token-holder').value;

    try {
        const { data, error } = await supabaseClient.auth.signUp({
            email: email,
            password: password
        });

        if (error) throw error;

        await supabaseClient
            .from('invitations')
            .update({ used: true })
            .eq('token', token);

        alert("Votre compte membre a été créé avec succès.");
        window.location.href = window.location.origin + window.location.pathname;
    } catch (err) {
        console.error(err);
        alert("Échec de la création du compte.");
    }
}

async function handleLoginSubmit(event) {
    event.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;

    try {
        const { data, error } = await supabaseClient.auth.signInWithPassword({
            email: email,
            password: password
        });

        if (error) throw error;

        const { data: { session } } = await supabaseClient.auth.getSession();
        updateUIVisibility(session);

        if (email === ADMIN_EMAIL) {
            switchView('dashboard');
        } else {
            switchView('members');
        }

        document.getElementById('login-form').reset();
    } catch (err) {
        console.error("Échec :", err);
        alert("Identifiants de connexion incorrects.");
    }
}

async function handleLogout() {
    if (confirm("Fermer la session actuelle ?")) {
        await supabaseClient.auth.signOut();
        updateUIVisibility(null);
        switchView('form');
    }
}

async function generateInviteLink() {
    const token = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2) + Date.now().toString(36);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    try {
        const { error } = await supabaseClient
            .from('invitations')
            .insert([{ token, expires_at: expiresAt }]);

        if (error) throw error;

        const generatedUrl = window.location.origin + window.location.pathname + "?invite=" + token;
        document.getElementById('invite-link-display').value = generatedUrl;
        document.getElementById('invite-link-container').classList.remove('hidden');
        lucide.createIcons();
    } catch (err) {
        console.error(err);
        alert("Erreur de génération du lien d'invitation.");
    }
}

async function deleteTeam(teamId) {
    if (confirm("Voulez-vous supprimer cet événement ?")) {
        teamsData = teamsData.filter(t => t.id !== teamId);
        await saveTeamsState();

        if (supabaseClient) {
            try {
                await supabaseClient
                    .from('notifications')
                    .delete()
                    .eq('event_id', teamId);
            } catch (err) {
                console.error("Échec de suppression de la notification associée :", err);
            }
        }

        renderTeamMaker();
    }
}

async function clearAllNotifications() {
    if (confirm("Voulez-vous supprimer définitivement l'intégralité de l'historique des notifications ?")) {
        if (supabaseClient) {
            try {
                const { error } = await supabaseClient
                    .from('notifications')
                    .delete()
                    .neq('id', '00000000-0000-0000-0000-000000000000'); 
                if (error) throw error;
                alert("Historique des notifications purgé.");
                loadDashboardData();
            } catch (err) {
                console.error("Échec de la purge :", err);
            }
        }
    }
}

function copyInviteLink() {
    const copyText = document.getElementById('invite-link-display');
    copyText.select();
    copyText.setSelectionRange(0, 99999);
    navigator.clipboard.writeText(copyText.value);
    alert("Lien d'invitation copié dans votre presse-papiers !");
}

async function submitForm(event) {
    event.preventDefault();

    if (!supabaseClient) {
        alert("Configuration invalide.");
        return;
    }

    const name = document.getElementById('player-name').value.trim();
    const desiredLevel = document.querySelector('input[name="desired-group"]:checked').value;

    const answers = {};
    let totalScore = 0;
    for (let i = 1; i <= 7; i++) {
        const checkedRadio = document.querySelector(`input[name="q${i}"]:checked`);
        const val = checkedRadio ? parseInt(checkedRadio.value, 10) : 0;
        answers[`q${i}`] = val;
        totalScore += val;
    }

    const calculatedLevel = determineLevel(totalScore);

    try {
        const { data, error } = await supabaseClient
            .from('players')
            .insert([
                { 
                    name: name, 
                    score: totalScore, 
                    calculated_level: calculatedLevel, 
                    desired_level: desiredLevel,
                    ...answers
                }
            ]);

        if (error) throw error;

        alert(`Merci ${name} ! Votre évaluation a été envoyée.`);
        document.getElementById('evaluation-form').reset();
    } catch (err) {
        console.error("Erreur de transmission :", err);
    }
}

// ==========================================
// GESTION DU PROFIL DU JOUEUR (Membres)
// ==========================================

// Décodeur universel pour lire les formats de tableaux PostgreSQL et JS (Focalisé sur 2 souhaits)
function parseWishlistArray(wishlistVal) {
    if (!wishlistVal) return ["", ""];
    if (Array.isArray(wishlistVal)) {
        let arr = [...wishlistVal];
        if (arr.length > 2) arr = arr.slice(0, 2);
        while (arr.length < 2) {
            arr.push("");
        }
        return arr;
    }
    if (typeof wishlistVal === 'string') {
        let cleaned = wishlistVal.replace(/[{}]/g, '');
        if (cleaned.trim() === "") return ["", ""];
        let parsed = cleaned.split(',').map(item => {
            let trimmed = item.trim();
            if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
                trimmed = trimmed.substring(1, trimmed.length - 1);
            }
            return (trimmed === "NULL" || trimmed === "null" || !trimmed) ? "" : trimmed;
        });
        if (parsed.length > 2) parsed = parsed.slice(0, 2);
        while (parsed.length < 2) {
            parsed.push("");
        }
        return parsed;
    }
    return ["", ""];
}

function renderWeaponCheckboxes() {
    const container = document.getElementById('weapons-checkboxes-container');
    if (!container) return;
    container.innerHTML = WEAPONS_LIST.map(weapon => `
        <label class="flex items-center gap-2.5 p-2 bg-[#0b0e14]/50 border border-[#1e2638] rounded-lg cursor-pointer hover:bg-[#161b26] transition select-none">
            <input type="checkbox" value="${weapon}" class="weapon-checkbox accent-blue-500 w-4 h-4 rounded" disabled onchange="handleWeaponLimit(this)">
            <span class="text-xs text-slate-300 font-medium">${weapon}</span>
        </label>
    `).join('');
}

function handleWeaponLimit(checkbox) {
    const checked = document.querySelectorAll('.weapon-checkbox:checked');
    if (checked.length > 2) {
        checkbox.checked = false;
        alert("Vous devez choisir au maximum 2 armes pour votre classe.");
    }
}

async function loadMemberProfile() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) return;

    renderWeaponCheckboxes();

    try {
        const { data, error } = await supabaseClient
            .from('member_profiles')
            .select('*')
            .eq('id', session.user.id)
            .single();

        if (data) {
            document.getElementById('profile-char-name').value = data.character_name || '';
            document.getElementById('profile-gear-score').value = data.gear_score || 0; 
            
            const checkboxes = document.querySelectorAll('.weapon-checkbox');
            checkboxes.forEach(cb => {
                if (cb.value === data.weapon1 || cb.value === data.weapon2) {
                    cb.checked = true;
                } else {
                    cb.checked = false;
                }
                cb.disabled = true;
            });

            // Décodage et chargement propre dans les deux champs de saisie (Souhait 1, 2)
            const wishlist = parseWishlistArray(data.wishlist);
            for (let i = 0; i < 2; i++) {
                const input = document.getElementById(`wishlist-item-${i}`);
                if (input) input.value = wishlist[i] || '';
            }

            // Gérer l'affichage du nombre de jetons restants pour le mois
            const tokens = data.wish_tokens !== undefined && data.wish_tokens !== null ? data.wish_tokens : 2;
            const counter = document.getElementById('wish-tokens-counter');
            if (counter) {
                counter.innerText = tokens;
            }

            // Rendu visuel de la Wishlist
            const summaryContainer = document.getElementById('wishlist-summary-container');
            if (summaryContainer) {
                const activeWishes = wishlist.filter(w => w && w.trim() !== "");
                if (activeWishes.length === 0) {
                    summaryContainer.innerHTML = `<span class="text-xs text-slate-500 italic block text-center">Aucun souhait enregistré</span>`;
                } else {
                    summaryContainer.innerHTML = activeWishes.map(wish => {
                        const itemObj = findItemByName(wish);
                        const iconHtml = itemObj ? getItemIconHTML(itemObj) : `<div class="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-500/20 bg-slate-500/5 text-slate-400 shrink-0"><i data-lucide="help-circle" class="w-4 h-4"></i></div>`;
                        const rarityText = itemObj ? (itemObj.rarity === 'legendary' ? 'Légendaire' : `Épique ${itemObj.tier || ''}`) : 'Objet personnalisé';
                        const colorClass = itemObj ? (itemObj.rarity === 'legendary' ? 'text-red-400' : 'text-purple-400') : 'text-slate-400';
                        const url = itemObj ? itemObj.questlogUrl : "#";

                        return `
                            <div class="flex items-center gap-2.5 p-2 bg-[#0b0e14]/50 border border-[#1e2638] rounded-xl hover:border-purple-500/30 transition">
                                ${iconHtml}
                                <div class="truncate">
                                    <a href="${url}" target="_blank" class="block text-xs font-bold text-slate-200 hover:text-purple-400 truncate">${wish}</a>
                                    <span class="block text-[9px] ${colorClass} font-semibold">${rarityText}</span>
                                </div>
                            </div>
                        `;
                    }).join('');
                }
            }

            document.getElementById('btn-edit-profile').classList.remove('hidden');
            document.getElementById('btn-save-profile').classList.add('hidden');
            document.getElementById('profile-char-name').disabled = true;
            document.getElementById('profile-gear-score').disabled = true; 
        } else {
            enableProfileEdit();
            document.getElementById('btn-edit-profile').classList.add('hidden');
        }
    } catch (err) {
        console.warn("Profil vide, prêt pour l'édition.");
        enableProfileEdit();
        document.getElementById('btn-edit-profile').classList.add('hidden');
    }
}

function enableProfileEdit() {
    document.getElementById('profile-char-name').disabled = false;
    document.getElementById('profile-gear-score').disabled = false; 
    const checkboxes = document.querySelectorAll('.weapon-checkbox');
    checkboxes.forEach(cb => cb.disabled = false);

    document.getElementById('btn-edit-profile').classList.add('hidden');
    const saveBtn = document.getElementById('btn-save-profile');
    saveBtn.classList.remove('hidden');
    saveBtn.disabled = false;
}

async function saveMemberProfile(event) {
    event.preventDefault();
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) return;

    const charName = document.getElementById('profile-char-name').value.trim();
    const gearScore = parseInt(document.getElementById('profile-gear-score').value, 10) || 0; 
    const selected = Array.from(document.querySelectorAll('.weapon-checkbox:checked')).map(cb => cb.value);

    if (selected.length !== 2) {
        alert("Veuillez sélectionner exactement 2 armes.");
        return;
    }

    const profileData = {
        id: session.user.id,
        email: session.user.email,
        character_name: charName,
        gear_score: gearScore, 
        weapon1: selected[0],
        weapon2: selected[1],
        updated_at: new Date().toISOString()
    };

    try {
        const { error } = await supabaseClient
            .from('member_profiles')
            .upsert(profileData);

        if (error) throw error;

        alert("Votre profil de classe a été sauvegardé.");
        await loadMembersViewData();
    } catch (err) {
        console.error(err);
        alert("Erreur lors de la sauvegarde.");
    }
}

// Sauvegarde de la liste de souhaits (Wishlist) limitée par les jetons disponibles
async function saveWishlist(event) {
    event.preventDefault();
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) return;

    const wish0 = document.getElementById('wishlist-item-0').value.trim();
    const wish1 = document.getElementById('wishlist-item-1').value.trim();
    const newWishlist = [wish0, wish1];
    const filledWishesCount = newWishlist.filter(w => w !== "").length;

    try {
        // 1. Récupérer le profil pour valider le nombre de jetons restants
        const { data: profile, error: profErr } = await supabaseClient
            .from('member_profiles')
            .select('*')
            .eq('id', session.user.id)
            .single();

        if (profErr) throw profErr;

        const tokens = profile.wish_tokens !== undefined && profile.wish_tokens !== null ? profile.wish_tokens : 2;

        if (filledWishesCount > tokens) {
            alert(`Action refusée ! Vous ne pouvez pas enregistrer ${filledWishesCount} souhaits car il ne vous reste que ${tokens} jeton(s) de souhait disponible(s) pour ce mois-ci.`);
            return;
        }

        // 2. Récupérer les enchères remportées
        const { data: resolvedAuctions, error } = await supabaseClient
            .from('auctions')
            .select('*')
            .eq('status', 'resolved')
            .eq('winner_id', session.user.id);

        if (error) throw error;

        const obtainedItems = resolvedAuctions ? resolvedAuctions.map(a => cleanCompareString(a.item_name)) : [];

        // Validation : Impossible de wishlister un objet déjà gagné par le passé
        for (const wish of newWishlist) {
            if (wish && obtainedItems.includes(cleanCompareString(wish))) {
                alert(`Action refusée ! Vous avez déjà obtenu l'objet "${wish}" lors d'une précédente enchère de guilde. Vous ne pouvez plus le rajouter à votre Wishlist.`);
                return;
            }
        }

        const { error: updErr } = await supabaseClient
            .from('member_profiles')
            .update({ wishlist: newWishlist })
            .eq('id', session.user.id);

        if (updErr) throw updErr;

        alert("Votre liste de souhaits (Wishlist) a été mise à jour !");
        await loadMembersViewData();
    } catch (err) {
        console.error("Échec de sauvegarde Wishlist :", err);
    }
}

async function applyToEvent(teamId, role) {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) return;

    const myProfile = allDatabaseMembers.find(m => m.id === session.user.id);
    const displayName = myProfile ? (myProfile.character_name || myProfile.email) : session.user.email;
    const myGs = myProfile ? (myProfile.gear_score || 0) : 0;

    const teamIndex = teamsData.findIndex(t => t.id === teamId);
    if (teamIndex !== -1) {
        const team = teamsData[teamIndex];

        if (team.gearScoreLimit && team.gearScoreLimit > 0) {
            if (myGs < team.gearScoreLimit) {
                alert(`Votre GearScore actuel (${myGs} GS) est inférieur au requis pour participer (${team.gearScoreLimit} GS).`);
                return;
            }
        }

        if (!team.applications) {
            team.applications = [];
        }

        team.applications = team.applications.filter(app => app.name !== displayName);
        team.applications.push({ name: displayName, role: role });

        await saveTeamsState();
        await loadMembersViewData();
    }
}

async function cancelApplication(teamId) {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) return;

    const myProfile = allDatabaseMembers.find(m => m.id === session.user.id);
    const displayName = myProfile ? (myProfile.character_name || myProfile.email) : session.user.email;

    const teamIndex = teamsData.findIndex(t => t.id === teamId);
    if (teamIndex !== -1 && teamsData[teamIndex].applications) {
        teamsData[teamIndex].applications = teamsData[teamIndex].applications.filter(app => app.name !== displayName);
        await saveTeamsState();
        await loadMembersViewData();
    }
}

function isPlayerAssignedToTeam(playerName, teamId) {
    const team = teamsData.find(t => t.id === teamId);
    if (!team) return false;
    if (team.players && team.players.includes(playerName)) return true;
    if (team.playersA && team.playersA.includes(playerName)) return true;
    if (team.playersB && team.playersB.includes(playerName)) return true;
    return false;
}

async function loadAuctionsFromStorage() {
    if (!supabaseClient) return;
    try {
        const { data, error } = await supabaseClient
            .from('auctions')
            .select('*')
            .order('created_at', { ascending: false });
        if (data) {
            auctionsData = data;
        }
    } catch (err) {
        console.error("Erreur de récupération des enchères :", err);
    }
}

// Création d'une nouvelle enchère par l'administrateur
async function handleCreateAuction(event) {
    event.preventDefault();
    if (!supabaseClient) return;

    const itemName = document.getElementById('auction-item-name').value.trim();
    const endTime = document.getElementById('auction-end-time').value;

    try {
        const { error } = await supabaseClient
            .from('auctions')
            .insert([{
                item_name: itemName,
                end_time: new Date(endTime).toISOString(),
                bids: {},
                status: 'active'
            }]);

        if (error) throw error;

        // Ajouter une notification historique de guilde
        await supabaseClient
            .from('notifications')
            .insert([{
                message: `🔥 L'enchère aveugle pour "${itemName}" a démarré ! Misez avant le ${formatEventDate(endTime)}.`
            }]);

        // Envoi de la notification Discord (Si activée globalement)
        if (notificationsEnabled) {
            await sendDiscordAuctionNotification(itemName, endTime);
        }

        alert(`L'enchère pour "${itemName}" a été lancée.`);
        document.getElementById('create-auction-form').reset();
        
        await loadDashboardData();
    } catch (err) {
        console.error("Échec du lancement de l'enchère :", err);
    }
}

async function submitBlindBid(auctionId, bidAmountInputId) {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session || !supabaseClient) return;

    const bidAmount = parseInt(document.getElementById(bidAmountInputId).value, 10);
    if (isNaN(bidAmount) || bidAmount <= 0) {
        alert("Saisissez un montant valide supérieur à 0.");
        return;
    }

    const myProfile = allDatabaseMembers.find(m => m.id === session.user.id);
    const myPoints = myProfile ? (myProfile.points || 0) : 0;
    const displayName = myProfile ? (myProfile.character_name || m.email) : session.user.email;

    if (bidAmount > myPoints) {
        alert(`Mise impossible ! Vous ne possédez que ${myPoints} points d'activité.`);
        return;
    }

    if (!confirm(`Confirmer votre mise secrète de ${bidAmount} points ?`)) {
        return;
    }

    try {
        const { data: auction, error: getErr } = await supabaseClient
            .from('auctions')
            .select('*')
            .eq('id', auctionId)
            .single();

        if (getErr || !auction) throw new Error("Impossible de trouver l'enchère.");

        if (new Date(auction.end_time) < new Date()) {
            alert("L'enchère est expirée.");
            return;
        }

        const currentBids = auction.bids || {};
        currentBids[session.user.id] = {
            char_name: displayName,
            amount: bidAmount,
            timestamp: new Date().toISOString()
        };

        const { error: updErr } = await supabaseClient
            .from('auctions')
            .update({ bids: currentBids })
            .eq('id', auctionId);

        if (updErr) throw updErr;

        alert("Mise secrète enregistrée !");
        await loadMembersViewData();
    } catch (err) {
        console.error(err);
    }
}

async function calculateBeneficiaryByItemName(itemName) {
    if (!itemName || !supabaseClient) return;
    
    try {
        const { data: members, error } = await supabaseClient
            .from('member_profiles')
            .select('*');
        
        if (error) throw error;
        
        const candidates = members.map(m => {
            const charName = m.character_name || maskEmail(m.email);
            const wishlist = m.wishlist || [];
            const hasWishlist = wishlist.some(item => item && item.toLowerCase().trim() === itemName.toLowerCase().trim());
            const currentPoints = m.points || 0;
            const score = (hasWishlist ? 100 : 0) + currentPoints;
            
            return {
                char_name: charName,
                email: m.email,
                score: score,
                hasWishlist: hasWishlist,
                points: currentPoints
            };
        });
        
        candidates.sort((a, b) => b.score - a.score);
        showPriorityModal(itemName, candidates);
    } catch (err) {
        console.error(err);
    }
}

function showPriorityModal(itemName, sortedMembers) {
    const modal = document.getElementById('info-modal');
    if (!modal) return;

    document.getElementById('modal-player-name').innerText = `Priorités : ${itemName}`;
    document.getElementById('modal-player-score').innerText = sortedMembers.length;
    document.getElementById('modal-player-level').innerText = "Simulé";
    document.getElementById('modal-submit-date').innerText = new Date().toLocaleDateString();

    const answersList = document.getElementById('modal-answers-list');
    answersList.innerHTML = `
        <div class="p-3 bg-[#0b0e14]/50 border border-[#1e2638] rounded-xl text-xs text-slate-400 mb-4 leading-relaxed font-sans">
            Formule appliquée : <strong>Score Priorité = (Wishlist [Poids : 100] + Points d'activité [Poids : 1])</strong>.
        </div>
    `;

    sortedMembers.forEach((m, idx) => {
        const badge = m.hasWishlist 
            ? `<span class="text-[10px] px-2 py-0.5 rounded bg-red-950/40 text-red-400 border border-red-500/20 font-bold uppercase tracking-wider">Wishlist active (+100)</span>`
            : `<span class="text-[10px] px-2 py-0.5 rounded bg-slate-950/40 text-slate-400 border border-slate-500/20 font-bold uppercase tracking-wider">Hors wishlist</span>`;

        answersList.innerHTML += `
            <div class="bg-[#161b26] border border-[#1e2638] p-3 rounded-xl flex items-center justify-between gap-4">
                <div class="flex items-center gap-3">
                    <span class="text-sm font-bold text-slate-400 font-sans">#${idx + 1}</span>
                    <div>
                        <span class="font-bold text-white text-sm block font-sans">${m.char_name}</span>
                        <span class="text-[10px] text-slate-500 block font-sans">${maskEmail(m.email)}</span>
                    </div>
                </div>
                <div class="text-right space-y-1">
                    <span class="text-xs font-extrabold text-amber-500 block font-sans">Score : ${m.score} pts</span>
                    ${badge}
                </div>
            </div>
        `;
    });

    modal.classList.remove('hidden');
    lucide.createIcons();
}

// Résolution de l'enchère par l'administrateur
async function resolveAuction(auctionId) {
    if (!supabaseClient) return;

    try {
        // 1. Récupérer l'enchère
        const { data: auction, error: getErr } = await supabaseClient
            .from('auctions')
            .select('*')
            .eq('id', auctionId)
            .single();

        if (getErr || !auction) throw new Error("Enchère introuvable.");

        // 2. Récupérer tous les membres pour validation de sécurité des points réels
        const { data: latestMembers, error: membersErr } = await supabaseClient
            .from('member_profiles')
            .select('*');

        if (membersErr) throw membersErr;

        const bidsMap = auction.bids || {};
        const bidsArray = [];

        for (const userId in bidsMap) {
            const bidInfo = bidsMap[userId];
            const memberProfile = latestMembers.find(m => m.id.toLowerCase() === userId.toLowerCase());
            const currentActualPoints = memberProfile ? (memberProfile.points || 0) : 0;

            if (bidInfo.amount <= currentActualPoints) {
                const wishlist = memberProfile ? parseWishlistArray(memberProfile.wishlist) : ["", ""];
                const hasWishlist = wishlist.some(item => item && cleanCompareString(item) === cleanCompareString(auction.item_name));

                bidsArray.push({
                    userId: userId,
                    char_name: bidInfo.char_name,
                    amount: bidInfo.amount,
                    timestamp: bidInfo.timestamp,
                    hasWishlist: hasWishlist,
                    profile: memberProfile
                });
            }
        }

        if (bidsArray.length === 0) {
            const { error } = await supabaseClient
                .from('auctions')
                .update({
                    status: 'resolved',
                    winner_name: 'Aucun',
                    winning_bid: 0
                })
                .eq('id', auctionId);

            if (error) throw error;
            alert("Aucune mise valide trouvée. L'enchère s'est clôturée sans vainqueur.");
            await loadDashboardData();
            return;
        }

        // 3. Application de la fusion Wishlist : Filtrer pour prioriser uniquement ceux l'ayant wishlisted
        const wishlistBidders = bidsArray.filter(b => b.hasWishlist);
        let finalCandidates = bidsArray;
        let priorityMessage = "";

        if (wishlistBidders.length > 0) {
            finalCandidates = wishlistBidders;
            priorityMessage = "🏆 Priorité de Wishlist active ! Seuls les offreurs l'ayant en wishlist sont éligibles.";
        }

        // 4. Trier les offreurs éligibles finaux (Montant puis Date)
        finalCandidates.sort((a, b) => {
            if (b.amount !== a.amount) {
                return b.amount - a.amount;
            }
            return new Date(a.timestamp) - new Date(b.timestamp);
        });

        const winner = finalCandidates[0];

        if (priorityMessage) {
            alert(priorityMessage);
        }

        if (!confirm(`Le vainqueur est "${winner.char_name}" avec une mise de ${winner.amount} pts (Wishlist Prioritaire).\nConfirmer et clôturer l'enchère ?`)) {
            return;
        }

        // 5. Débiter les points, nettoyer la wishlist et consommer 1 jeton de souhait
        const newPointsTotal = winner.profile.points - winner.amount;
        const winnerWishlist = parseWishlistArray(winner.profile.wishlist);
        
        let tokenSpent = false;
        const cleanedWishlist = winnerWishlist.map(item => {
            if (item && cleanCompareString(item) === cleanCompareString(auction.item_name)) {
                tokenSpent = true; // Jeton consommé
                return ""; // On vide l'emplacement
            }
            return item;
        });

        // Calcul du nouveau solde de jetons
        const currentTokens = winner.profile.wish_tokens !== undefined && winner.profile.wish_tokens !== null ? winner.profile.wish_tokens : 2;
        const newTokensTotal = tokenSpent ? Math.max(0, currentTokens - 1) : currentTokens;

        const updatePayload = {
            points: newPointsTotal,
            wishlist: cleanedWishlist,
            wish_tokens: newTokensTotal
        };

        // 6. Mise à jour unifiée en une seule transaction
        const { error: profileErr } = await supabaseClient
            .from('member_profiles')
            .update(updatePayload)
            .eq('id', winner.userId);

        if (profileErr) {
            console.error("Échec de mise à jour du profil du vainqueur :", profileErr);
            throw new Error("Impossible de débiter les points ou de mettre à jour les souhaits.");
        }

        // 7. Mettre à jour l'enchère à résolue
        const { error: resolveErr } = await supabaseClient
            .from('auctions')
            .update({
                status: 'resolved',
                winner_id: winner.userId,
                winner_name: winner.char_name,
                winning_bid: winner.amount
            })
            .eq('id', auctionId);

        if (resolveErr) throw resolveErr;

        // 8. Publier la notification dans l'historique
        await supabaseClient
            .from('notifications')
            .insert([{
                message: `🏆 L'enchère pour "${auction.item_name}" a été remportée par ${winner.char_name} avec une offre de ${winner.amount} points !`
            }]);

        alert(`Succès ! L'enchère est clôturée. ${winner.char_name} a remporté l'objet.`);
        await loadDashboardData();
    } catch (err) {
        console.error("Erreur de clôture :", err);
        alert("Une erreur s'est produite lors de la validation : " + err.message);
    }
}

function getRemainingTimeText(endTimeStr) {
    const diff = new Date(endTimeStr) - new Date();
    if (diff <= 0) return "En attente de clôture";
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return `Temps restant : ${hours}h ${minutes}m`;
}

// Chargement de l'Espace Membre
async function loadMembersViewData() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) return;

    document.getElementById('member-display-email').innerText = session.user.email;

    try {
        const { data: notices, error } = await supabaseClient
            .from('notifications')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(3);

        if (notices && notices.length > 0) {
            const banner = document.getElementById('notifications-banner');
            const list = document.getElementById('notifications-list');
            if (banner && list) {
                list.innerHTML = notices.map(n => `<li>${n.message}</li>`).join('');
                banner.classList.remove('hidden');
            }
        } else {
            document.getElementById('notifications-banner')?.classList.add('hidden');
        }
    } catch (err) {
        console.log("Lecture des notifications non disponible.");
    }

    await loadMemberProfile();
    await loadTeamsFromStorage();
    await loadAuctionsFromStorage();
    await loadFormStatus();

    try {
        const { data: members, error } = await supabaseClient
            .from('member_profiles')
            .select('*');
        if (error) throw error;
        allDatabaseMembers = members;
    } catch (err) {
        console.warn("Impossible de récupérer la liste des membres.");
    }

    const memberAuctionsContainer = document.getElementById('members-auctions-container');
    const memberAuctionsView = document.getElementById('members-auctions-view');
    
    const activeAuctions = auctionsData.filter(a => a.status === 'active');
    
    if (activeAuctions.length > 0 && memberAuctionsContainer && memberAuctionsView) {
        memberAuctionsView.classList.remove('hidden');
        memberAuctionsContainer.innerHTML = activeAuctions.map((auc, index) => {
            const bidsMap = auc.bids || {};
            const myBid = bidsMap[session.user.id] ? bidsMap[session.user.id].amount : null;
            const remainingText = getRemainingTimeText(auc.end_time);

            const itemObj = findItemByName(auc.item_name);
            const iconHtml = itemObj ? getItemIconHTML(itemObj) : `<div class="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-500/20 bg-[#0b0e14]/40 text-slate-400 shrink-0"><i data-lucide="help-circle" class="w-4 h-4"></i></div>`;

            // Extraction et tri des offres des autres joueurs
            const otherBids = Object.entries(bidsMap)
                .filter(([userId]) => userId !== session.user.id)
                .map(([_, bid]) => ({
                    char_name: bid.char_name || "Joueur anonyme",
                    amount: bid.amount,
                    timestamp: bid.timestamp
                }))
                .sort((a, b) => b.amount - a.amount); // Tri de l'offre la plus haute à la plus basse

            // Génération du HTML pour la liste des autres propositions
            let otherBidsListHtml = "";
            if (otherBids.length > 0) {
                otherBidsListHtml = `
                    <div class="w-full mt-4 pt-3 border-t border-[#1e2638] space-y-2">
                        <span class="block text-[10px] text-slate-500 uppercase font-bold tracking-wider">Offres des autres membres (${otherBids.length})</span>
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-28 overflow-y-auto pr-1">
                            ${otherBids.map(b => `
                                <div class="flex items-center justify-between p-2 bg-[#0b0e14]/40 border border-[#1e2638]/60 rounded-lg text-xs">
                                    <span class="font-semibold text-slate-300">${b.char_name}</span>
                                    <span class="font-bold text-amber-400">
                                        ${b.amount} pts 
                                        <span class="text-[9px] text-slate-500 font-normal">
                                            (${new Date(b.timestamp).toLocaleTimeString('fr-FR', {hour: '2-digit', minute:'2-digit'})})
                                        </span>
                                    </span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `;
            } else {
                otherBidsListHtml = `
                    <div class="w-full mt-4 pt-3 border-t border-[#1e2638] text-center">
                        <span class="text-xs text-slate-500 italic">Aucune autre offre soumise pour le moment.</span>
                    </div>
                `;
            }

            return `
                <div class="bg-[#161b26] border border-[#1e2638] rounded-xl p-4 flex flex-col gap-2 animate-fade-in">
                    <!-- Ligne principale : Infos de l'objet et Formulaire de mise -->
                    <div class="flex flex-wrap justify-between items-center gap-4">
                        <div class="flex items-center gap-3">
                            ${iconHtml}
                            <div>
                                <h4 class="font-bold text-sm text-amber-400 flex items-center gap-1.5 uppercase font-sans">
                                    <a href="${itemObj ? itemObj.questlogUrl : '#'}" target="_blank" class="hover:text-amber-300 transition">${auc.item_name}</a>
                                </h4>
                                <p class="text-xs text-slate-400 mt-1">${remainingText}</p>
                            </div>
                        </div>
                        <div class="flex flex-wrap items-center gap-4">
                            <div class="text-right">
                                <span class="block text-[10px] text-slate-500 uppercase font-bold">Votre mise actuelle</span>
                                <span class="text-sm font-extrabold text-[#38bdf8]">${myBid !== null ? `${myBid} points` : 'Aucune'}</span>
                            </div>
                            <div class="flex gap-2">
                                <input type="number" id="member-bid-input-${index}" placeholder="Mise" class="bg-[#0b0e14] border border-[#252f44] focus:border-blue-500 rounded-lg px-3 py-1.5 text-xs text-slate-100 outline-none w-20">
                                <button onclick="submitBlindBid('${auc.id}', 'member-bid-input-${index}')" class="bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold px-4 py-1.5 rounded-lg transition duration-150">
                                    Miser
                                </button>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Ligne secondaire : Affichage des propositions des autres joueurs -->
                    ${otherBidsListHtml}
                </div>
            `;
        }).join('');
    } else {
        memberAuctionsView?.classList.add('hidden');
    }

    const membersTeamsView = document.getElementById('members-teams-view');
    membersTeamsView.innerHTML = "";

    if (teamsData.length === 0) {
        membersTeamsView.innerHTML = `<div class="col-span-full p-4 text-center text-slate-500">Aucune équipe n'est encore constituée par l'administrateur.</div>`;
    } else {
// Dans loadMembersViewData, remplacez le début de la boucle "teamsData.forEach(team => {" par :
    teamsData.forEach(team => {
        let teamPlayersHtml = "";
        let applicationsPanelHtml = "";
        let gsBadgeHtml = ""; 

        // Calcul dynamique des points attendus pour l'activité
        let calculatedBase = pointsConfig[team.motif] || 10;
        if (team.motif === "Épreuve dimensionnelle" && team.dimensionalTier) {
            calculatedBase += getDimensionalTierBonus(team.dimensionalTier);
        }

        const myProfile = allDatabaseMembers.find(m => m.id === session.user.id);
        const displayName = myProfile ? (myProfile.character_name || myProfile.email) : session.user.email;
        const isAssigned = isPlayerAssignedToTeam(displayName, team.id);

            if (team.validated) {
                applicationsPanelHtml = `
                    <div class="mt-4 p-2.5 bg-emerald-950/20 border border-emerald-500/20 rounded-xl text-center text-xs text-emerald-400 font-bold select-none flex items-center justify-center gap-1.5">
                        <i data-lucide="check-circle" class="w-4 h-4"></i>
                        Activité validée (Points distribués : +${team.distributedPoints || 10} pts)
                    </div>
                `;
            } else if (isAssigned) {
                applicationsPanelHtml = `
                    <div class="mt-4 p-2.5 bg-blue-950/20 border border-blue-500/20 rounded-xl text-center text-xs text-blue-400 font-bold select-none flex items-center justify-center gap-1.5">
                        <i data-lucide="shield-check" class="w-4 h-4"></i>
                        Vous êtes déjà assigné à cette composition
                    </div>
                `;
            } else {
                const myApplication = team.applications ? team.applications.find(app => app.name === displayName) : null;
                if (myApplication) {
                    let roleColor = "text-blue-400";
                    if (myApplication.role === 'DPS') roleColor = "text-red-400";
                    if (myApplication.role === 'Healer') roleColor = "text-emerald-400";

                    applicationsPanelHtml = `
                        <div class="mt-4 p-3 bg-[#0b0e14]/60 border border-[#252f44] rounded-xl flex items-center justify-between gap-2 animate-fade-in">
                            <span class="text-xs text-slate-300">Candidature active : <span class="${roleColor} font-bold">${myApplication.role}</span></span>
                            <button onclick="cancelApplication('${team.id}')" class="text-xs text-red-400 hover:text-red-300 underline font-medium transition">
                                Annuler
                            </button>
                        </div>
                    `;
                } else {
                    applicationsPanelHtml = `
                        <div class="mt-4 space-y-2 animate-fade-in">
                            <span class="block text-[10px] text-slate-500 font-bold uppercase tracking-wider">Postuler pour ce rôle :</span>
                            <div class="grid grid-cols-3 gap-2">
                                <button onclick="applyToEvent('${team.id}', 'Tank')" class="bg-blue-600/10 hover:bg-blue-600/30 text-blue-400 border border-blue-500/20 hover:border-blue-500/40 py-2 rounded-xl text-[11px] font-bold transition flex items-center justify-center gap-1">
                                    <i data-lucide="shield" class="w-3.5 h-3.5"></i> Tank
                                </button>
                                <button onclick="applyToEvent('${team.id}', 'DPS')" class="bg-red-600/10 hover:bg-red-600/30 text-red-400 border border-red-500/20 hover:border-red-500/40 py-2 rounded-xl text-[11px] font-bold transition flex items-center justify-center gap-1">
                                    <i data-lucide="swords" class="w-3.5 h-3.5"></i> DPS
                                </button>
                                <button onclick="applyToEvent('${team.id}', 'Healer')" class="bg-emerald-600/10 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/20 hover:border-emerald-500/40 py-2 rounded-xl text-[11px] font-bold transition flex items-center justify-center gap-1">
                                    <i data-lucide="heart" class="w-3.5 h-3.5"></i> Healer
                                </button>
                            </div>
                        </div>
                    `;
                }
            }

            let appsHtml = "";
            if (team.applications && team.applications.length > 0) {
                team.applications.forEach(app => {
                    if (!isPlayerAssignedToTeam(app.name, team.id)) {
                        let roleIcon = '<i data-lucide="shield" class="w-3.5 h-3.5 text-blue-400"></i>';
                        if (app.role === 'DPS') roleIcon = '<i data-lucide="swords" class="w-3.5 h-3.5 text-red-400"></i>';
                        if (app.role === 'Healer') roleIcon = '<i data-lucide="heart" class="w-3.5 h-3.5 text-emerald-400"></i>';
                        
                        const dbMember = allDatabaseMembers.find(dbM => (dbM.character_name || dbM.email) === app.name);
                        const weaponsHtml = dbMember ? getWeaponIcon(dbMember.weapon1) + getWeaponIcon(dbMember.weapon2) : "";

                        appsHtml += `
                            <div class="bg-[#111622] border border-[#1e2638] p-2 rounded-lg flex items-center justify-between gap-1.5 text-xs animate-fade-in">
                                <div class="flex items-center gap-1.5">
                                    ${roleIcon}
                                    <span class="font-bold text-white truncate max-w-[120px]">${app.name}</span>
                                </div>
                                <div class="flex items-center gap-1 shrink-0">${weaponsHtml}</div>
                            </div>
                        `;
                    }
                });
            }
            if (appsHtml === "") {
                appsHtml = `<div class="p-3 text-center text-slate-600 text-xs italic select-none">Aucun postulant</div>`;
            }

            if (team.motif === "Raid") {
                let slotsAHtml = "";
                let slotsBHtml = "";
                for (let i = 0; i < 6; i++) {
                    const pA = team.playersA ? team.playersA[i] : null;
                    if (pA) {
                        const dbMember = allDatabaseMembers.find(dbM => (dbM.character_name || dbM.email) === pA);
                        const icons = dbMember ? getWeaponIcon(dbMember.weapon1) + getWeaponIcon(dbMember.weapon2) : "";
                        slotsAHtml += `
                            <div class="bg-[#111622] border border-[#252f44] p-2 rounded-lg flex items-center justify-between gap-1.5 transition text-xs">
                                <span class="font-bold text-white truncate max-w-[100px]">${pA}</span>
                                <div class="flex items-center gap-1 shrink-0">${icons}</div>
                            </div>
                        `;
                    } else {
                        slotsAHtml += `<div class="border border-dashed border-[#1e2638] p-2 rounded-lg text-center text-slate-700 text-[10px]">Vide</div>`;
                    }

                    const pB = team.playersB ? team.playersB[i] : null;
                    if (pB) {
                        const dbMember = allDatabaseMembers.find(dbM => (dbM.character_name || dbM.email) === pB);
                        const icons = dbMember ? getWeaponIcon(dbMember.weapon1) + getWeaponIcon(dbMember.weapon2) : "";
                        slotsBHtml += `
                            <div class="bg-[#111622] border border-[#252f44] p-2 rounded-lg flex items-center justify-between gap-1.5 transition text-xs">
                                <span class="font-bold text-white truncate max-w-[100px]">${pB}</span>
                                <div class="flex items-center gap-1 shrink-0">${icons}</div>
                            </div>
                        `;
                    } else {
                        slotsBHtml += `<div class="border border-dashed border-[#1e2638] p-2 rounded-lg text-center text-slate-700 text-[10px]">Vide</div>`;
                    }
                }

                let raidBadgeClass = "bg-pink-500/10 text-pink-400 border-pink-500/20";
                const difficultyText = team.raidDifficulty || "Raid Normal";
                if (difficultyText === "Raid Hardcore") {
                    raidBadgeClass = "bg-red-500/10 text-red-400 border-red-500/20";
                } else if (difficultyText === "Raid Nightmare") {
                    raidBadgeClass = "bg-purple-600/10 text-purple-600/20";
                }

                membersTeamsView.innerHTML += `
                    <div class="col-span-full bg-[#161b26]/50 border border-[#1e2638] rounded-xl p-5 space-y-4 animate-fade-in">
                        <div class="flex justify-between items-center border-b border-[#1e2638] pb-3 flex-wrap gap-2">
                            <div class="flex items-center gap-3">
                                <span class="text-xs px-2.5 py-1 rounded-full border ${raidBadgeClass} font-bold uppercase tracking-wider">${difficultyText}</span>
                                <span class="font-bold text-sm text-slate-200">${team.name}</span>
                                <span class="text-xs text-slate-500">${formatEventDate(team.date)}</span>
                                ${gsBadgeHtml}
                            </div>
                        </div>
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div class="bg-[#0b0e14]/40 border border-[#1e2638] rounded-xl p-4 space-y-3">
                                <span class="text-xs font-bold text-slate-300 block border-b border-[#1e2638] pb-1.5 uppercase tracking-wider">Postulants</span>
                                <div class="flex flex-col gap-2 max-h-[460px] overflow-y-auto">${appsHtml}</div>
                            </div>
                            <div class="bg-[#0b0e14]/40 border border-[#1e2638] rounded-xl p-4 space-y-3">
                                <h5 class="text-xs font-bold text-slate-300 flex justify-between border-b border-[#1e2638] pb-1.5">
                                    <span>GROUPE A</span>
                                    <span class="text-slate-500 font-bold">${team.playersA ? team.playersA.length : 0}/6</span>
                                </h5>
                                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">${slotsAHtml}</div>
                            </div>
                            <div class="bg-[#0b0e14]/40 border border-[#1e2638] rounded-xl p-4 space-y-3">
                                <h5 class="text-xs font-bold text-slate-300 flex justify-between border-b border-[#1e2638] pb-1.5">
                                    <span>GROUPE B</span>
                                    <span class="text-slate-500 font-bold">${team.playersB ? team.playersB.length : 0}/6</span>
                                </h5>
                                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">${slotsBHtml}</div>
                            </div>
                        </div>
                        ${applicationsPanelHtml}
                    </div>
                `;
            } else {
                let teamSlotsHtml = "";
                let badgeColor = "bg-blue-500/10 text-blue-400 border-blue-500/20";
                let labelText = team.motif;
                if (team.motif === "PVP") {
                    badgeColor = "bg-purple-500/10 text-purple-400 border-purple-500/20";
                } else if (team.motif === "Boss de guilde") {
                    badgeColor = "bg-amber-500/10 text-amber-400 border-amber-500/20";
                } else if (team.motif === "Épreuve dimensionnelle") {
                    badgeColor = "bg-cyan-500/10 text-cyan-400 border-cyan-500/20";
                    if (team.dimensionalTier) {
                        labelText = `Épreuve (${team.dimensionalTier})`;
                    }
                }

                for (let i = 0; i < 6; i++) {
                    const playerName = team.players ? team.players[i] : null;
                    if (playerName) {
                        const dbMember = allDatabaseMembers.find(dbM => (dbM.character_name || dbM.email) === playerName);
                        let iconsHtml = "";
                        if (dbMember) {
                            iconsHtml = getWeaponIcon(dbMember.weapon1) + getWeaponIcon(dbMember.weapon2);
                        }
                        teamPlayersHtml += `
                            <div class="bg-[#111622] border border-[#252f44] p-2 rounded-lg flex items-center justify-between gap-1.5">
                                <span class="font-bold text-white text-xs truncate max-w-[120px]">${playerName}</span>
                                <div class="flex items-center gap-1 shrink-0">${iconsHtml}</div>
                            </div>
                        `;
                    } else {
                        teamPlayersHtml += `
                            <div class="border border-dashed border-[#1e2638] p-2 rounded-lg text-center text-slate-700 text-xs select-none">
                                Vide
                            </div>
                        `;
                    }
                }

                membersTeamsView.innerHTML += `
                    <div class="bg-[#161b26]/50 border border-[#1e2638] rounded-xl p-5 space-y-4 animate-fade-in">
                        <div class="border-b border-[#1e2638] pb-2 flex items-center justify-between flex-wrap gap-2">
                            <h4 class="font-bold text-sm text-slate-200">${team.name}</h4>
                            <span class="text-[9px] px-2 py-0.5 rounded border ${badgeColor} font-bold uppercase tracking-wider">${labelText}</span>
                        </div>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div class="bg-[#0b0e14]/40 border border-[#1e2638] rounded-xl p-3.5 space-y-2">
                                <span class="text-[10px] text-slate-400 font-bold uppercase tracking-wider block border-b border-[#1e2638] pb-1.5">Postulants</span>
                                <div class="flex flex-col gap-2 max-h-[180px] overflow-y-auto">${appsHtml}</div>
                            </div>
                            <div class="bg-[#0b0e14]/40 border border-[#1e2638] rounded-xl p-3.5 space-y-2">
                                <div class="flex justify-between items-center border-b border-[#1e2638] pb-1.5">
                                    <span class="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Composition</span>
                                    <span class="text-[10px] text-slate-500 font-bold">${team.players ? team.players.length : 0} / 6</span>
                                </div>
                                <div class="space-y-1.5">${teamPlayersHtml}</div>
                            </div>
                        </div>
                       ${applicationsPanelHtml}
                        <div class="flex justify-between items-center text-[10px] text-slate-500 mt-2 border-t border-[#1e2638] pt-2">
                            <span>Prévu le : ${formatEventDate(team.date)} | Valeur : ${calculatedBase} pts</span>
                        </div>
                    </div>
                `;
            }
        });
    }
    // ==========================================
    // RENDU DU CLASSEMENT DES MEMBRES (LEADERBOARD)
    // ==========================================
    const leaderboardContainer = document.getElementById('members-leaderboard-container');
    if (leaderboardContainer) {
        // Trier la liste locale des membres par ordre décroissant de points
        const sortedMembers = [...allDatabaseMembers].sort((a, b) => {
            const ptsA = a.points || 0;
            const ptsB = b.points || 0;
            return ptsB - ptsA;
        });

        if (sortedMembers.length === 0) {
            leaderboardContainer.innerHTML = `<span class="text-xs text-slate-500 italic block text-center">Aucun membre enregistré</span>`;
        } else {
            leaderboardContainer.innerHTML = sortedMembers.map((m, idx) => {
                const maskedEmail = maskEmail(m.email);
                const displayName = m.character_name || maskedEmail;
                const points = m.points || 0;
                
                // Attribution visuelle du rang (emojis pour le podium, # sinon)
                let rankBadge = `<span class="text-xs text-slate-500 font-bold shrink-0 w-6">#${idx + 1}</span>`;
                if (idx === 0) rankBadge = `<span class="text-base shrink-0 w-6" title="1er">🥇</span>`;
                else if (idx === 1) rankBadge = `<span class="text-base shrink-0 w-6" title="2ème">🥈</span>`;
                else if (idx === 2) rankBadge = `<span class="text-base shrink-0 w-6" title="3ème">🥉</span>`;

                // Chargement des icônes d'armes configurées par le membre
                const weaponsHtml = m.weapon1 ? getWeaponIcon(m.weapon1) + getWeaponIcon(m.weapon2) : "";

                return `
                    <div class="flex items-center justify-between gap-3 p-2 bg-[#0b0e14]/50 border border-[#1e2638] rounded-xl hover:border-blue-500/20 transition">
                        <div class="flex items-center gap-2.5 min-w-0">
                            ${rankBadge}
                            <div class="truncate">
                                <span class="block text-xs font-bold text-slate-200 truncate" title="${displayName}">${displayName}</span>
                            </div>
                        </div>
                        <div class="flex items-center gap-2 shrink-0">
                            <div class="flex items-center gap-0.5">${weaponsHtml}</div>
                            <span class="text-xs font-bold text-emerald-400">${points} pts</span>
                        </div>
                    </div>
                `;
            }).join('');
        }
    }
    lucide.createIcons();
}

// Ajoutez cette nouvelle fonction d'action d'administration
async function resetMemberWishes(memberId, memberName) {
    if (!supabaseClient) return;
    
    // Message de validation interactif pour parer à toute fausse manipulation
    if (confirm(`Êtes-vous sûr de vouloir réinitialiser manuellement le quota de souhaits de "${memberName}" à 2 jetons pour ce mois-ci ?`)) {
        try {
            const { error } = await supabaseClient
                .from('member_profiles')
                .update({ wish_tokens: 2 })
                .eq('id', memberId);

            if (error) throw error;

            alert(`Le quota de souhaits de "${memberName}" a été réinitialisé à 2 jetons avec succès.`);
            await loadDashboardData();
        } catch (err) {
            console.error("Erreur de réinitialisation manuelle :", err);
            alert("Une erreur est survenue lors de la réinitialisation.");
        }
    }
}

async function loadDashboardData() {
    try {
        await loadFormStatus();
        const { data: players, error } = await supabaseClient
            .from('players')
            .select('*')
            .order('score', { ascending: false });

        if (error) throw error;

        allDatabasePlayers = players; 

        const totalPlayers = players.length;
        let totalScoreSum = 0;
        let ultraHighLevelCount = 0;
        let discrepanciesCount = 0;

        const levelsDistribution = {
            "Niveau normal": 0,
            "Niveau moyen": 0,
            "Haut niveau": 0,
            "Très haut niveau": 0
        };

        const topPlayers = players.slice(0, 10);

        players.forEach(p => {
            totalScoreSum += p.score;
            if (p.calculated_level === "Très haut niveau") {
                ultraHighLevelCount++;
            }
            if (p.calculated_level !== p.desired_level) {
                discrepanciesCount++;
            }
            if (levelsDistribution[p.calculated_level] !== undefined) {
                levelsDistribution[p.calculated_level]++;
            }
        });

        const averageScore = totalPlayers > 0 ? (totalScoreSum / totalPlayers).toFixed(1) : "0.0";

        document.getElementById('stat-total').innerText = totalPlayers;
        document.getElementById('stat-avg').innerText = averageScore;
        document.getElementById('stat-high').innerText = ultraHighLevelCount;
        document.getElementById('stat-diffs').innerText = discrepanciesCount;

        const tableBody = document.getElementById('table-body');
        tableBody.innerHTML = "";

        if (players.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-slate-500">Aucune candidature enregistrée.</td></tr>`;
        } else {
            players.forEach(p => {
                const dateFormatted = new Date(p.created_at).toLocaleDateString('fr-FR', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric'
                });

                let badgeClass = "text-xs px-2.5 py-1 rounded-full border ";
                if (p.calculated_level === "Très haut niveau") {
                    badgeClass += "bg-[#ff3355]/10 text-[#ff3355] border-[#ff3355]/20";
                } else if (p.calculated_level === "Haut niveau") {
                    badgeClass += "bg-orange-500/10 text-orange-400 border-orange-500/20";
                } else if (p.calculated_level === "Niveau moyen") {
                    badgeClass += "bg-yellow-500/10 text-yellow-400 border-yellow-500/20";
                } else {
                    badgeClass += "bg-blue-500/10 text-blue-400 border-blue-500/20";
                }

                tableBody.innerHTML += `
                    <tr class="hover:bg-[#161b26]/40 transition duration-150">
                        <td class="p-4 font-semibold text-white">${p.name}</td>
                        <td class="p-4 text-[#38bdf8] font-bold text-base">${p.score}</td>
                        <td class="p-4"><span class="${badgeClass}">${p.calculated_level}</span></td>
                        <td class="p-4 text-slate-400">${p.desired_level}</td>
                        <td class="p-4 text-slate-500 text-xs">${dateFormatted}</td>
                        <td class="p-4 text-center">
                            <div class="flex items-center justify-center gap-2">
                                <button onclick="openInfoModal('${p.id}')" class="bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 hover:text-white px-2.5 py-1 rounded border border-blue-500/20 text-xs font-semibold transition inline-flex items-center gap-1" title="Voir les réponses">
                                    <i data-lucide="info" class="w-3.5 h-3.5"></i>
                                    Fiche
                                </button>
                                <button onclick="deletePlayerFromDatabase('${p.id}', '${p.name}')" class="bg-red-600/20 hover:bg-red-600/40 text-red-400 hover:text-white px-2.5 py-1 rounded border border-red-500/20 text-xs font-semibold transition inline-flex items-center gap-1" title="Supprimer définitivement">
                                    <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                                    Supprimer
                                </button>
                            </div>
                        </td>
                    </tr>
                `;
            });
        }

        const { data: members, error: membersError } = await supabaseClient
            .from('member_profiles')
            .select('*')
            .order('email');

        if (membersError) throw membersError;
        allDatabaseMembers = members; 

        const membersTableBody = document.getElementById('members-table-body');
        if (membersTableBody) {
            membersTableBody.innerHTML = "";
            if (members.length === 0) {
                membersTableBody.innerHTML = `<tr><td colspan="7" class="p-4 text-center text-slate-500">Aucun membre enregistré.</td></tr>`;
            } else {
                members.forEach(m => {
                    let deleteButtonHtml = "";
                    const maskedEmail = maskEmail(m.email);
                    const displayName = m.character_name || maskedEmail;
                    const currentTokens = m.wish_tokens !== undefined && m.wish_tokens !== null ? m.wish_tokens : 2;
        
                    if (m.email !== ADMIN_EMAIL) {
                        deleteButtonHtml = `
                            <div class="flex flex-wrap justify-center gap-1.5">
                                <button onclick="resetMemberWishes('${m.id}', '${displayName}')" class="bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 hover:text-white px-2.5 py-1 rounded border border-blue-500/20 text-xs font-semibold transition inline-flex items-center gap-1" title="Réinitialiser le quota à 2 jetons">
                                    <i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i>
                                    Reset Souhaits
                                </button>
                                <button onclick="deleteMemberAccount('${m.id}', '${displayName}')" class="bg-red-600/20 hover:bg-red-600/40 text-red-400 hover:text-white px-2.5 py-1 rounded border border-red-500/20 text-xs font-semibold transition inline-flex items-center gap-1" title="Supprimer le compte de la guilde">
                                    <i data-lucide="user-minus" class="w-3.5 h-3.5"></i>
                                    Supprimer
                                </button>
                            </div>
                        `;
                    } else {
                        deleteButtonHtml = `<span class="text-xs text-slate-500 font-semibold italic select-none">Administrateur</span>`;
                    }
        
                    membersTableBody.innerHTML += `
                        <tr class="hover:bg-[#161b26]/40 transition duration-150">
                            <td class="p-4 font-semibold text-slate-400">${maskedEmail}</td>
                            <td class="p-4 text-[#38bdf8] font-bold text-sm">${m.character_name || 'Non configuré'}</td>
                            <td class="p-4 font-extrabold text-amber-500 text-sm">${m.gear_score || 0} GS</td>
                            <td class="p-4"><span class="text-xs px-2.5 py-1 rounded bg-[#161b26] border border-[#252f44] text-slate-300 font-semibold flex items-center gap-1.5">${getWeaponIcon(m.weapon1)} ${m.weapon1 || '--'}</span></td>
                            <td class="p-4"><span class="text-xs px-2.5 py-1 rounded bg-[#161b26] border border-[#252f44] text-slate-300 font-semibold flex items-center gap-1.5">${getWeaponIcon(m.weapon2)} ${m.weapon2 || '--'}</span></td>
                            <td class="p-4 font-bold text-emerald-400">${m.points || 0} pts</td>
                            <td class="p-4 text-center font-bold text-blue-400">${currentTokens} / 2</td>
                            <td class="p-4 text-center">
                                ${deleteButtonHtml}
                            </td>
                        </tr>
                    `;
                });
            }
        }

        await loadTeamsFromStorage();
        await loadAuctionsFromStorage();

        const adminAuctionsTableBody = document.getElementById('admin-auctions-table-body');
        if (adminAuctionsTableBody) {
            adminAuctionsTableBody.innerHTML = "";
            if (auctionsData.length === 0) {
                adminAuctionsTableBody.innerHTML = `<tr><td colspan="7" class="p-4 text-center text-slate-500">Aucune enchère active ou passée.</td></tr>`;
            } else {
                auctionsData.forEach(auc => {
                    const bidsCount = Object.keys(auc.bids || {}).length;
                    const isExpired = new Date(auc.end_time) < new Date();
                    const statusLabel = auc.status === 'resolved' 
                        ? `<span class="text-xs px-2 py-0.5 rounded bg-emerald-950/40 text-emerald-400 border border-emerald-500/30">Résolue</span>`
                        : (isExpired 
                            ? `<span class="text-xs px-2 py-0.5 rounded bg-red-950/40 text-red-400 border border-red-900/30 animate-pulse">Expirée</span>`
                            : `<span class="text-xs px-2 py-0.5 rounded bg-blue-950/40 text-blue-400 border-blue-500/30">En cours</span>`
                        );

                    const cleanItemName = auc.item_name.replace(/'/g, "\\'");
                    const itemObj = findItemByName(auc.item_name);
                    const iconHtml = itemObj ? getItemIconHTML(itemObj) : `<div class="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-500/20 bg-slate-500/5 text-slate-400 shrink-0"><i data-lucide="help-circle" class="w-4 h-4"></i></div>`;

                    const actionButtonHtml = auc.status === 'active'
                        ? `<div class="flex flex-col sm:flex-row gap-1.5 justify-center items-center">
                            <button onclick="resolveAuction('${auc.id}')" class="bg-amber-600 hover:bg-amber-700 text-white font-bold py-1 px-2.5 rounded text-xs transition flex items-center gap-1" title="Désigner le vainqueur éligible">
                                <i data-lucide="check-circle" class="w-3.5 h-3.5"></i> Clôturer
                            </button>
                            <button onclick="calculateBeneficiaryByItemName('${cleanItemName}')" class="bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 hover:text-white px-2 py-1 rounded border border-blue-500/20 text-xs font-semibold transition flex items-center gap-1" title="Simuler l'ordre de priorité Wishlist + Points">
                                <i data-lucide="calculator" class="w-3.5 h-3.5"></i> Priorités
                            </button>
                           </div>`
                        : `<span class="text-xs text-slate-500 italic">Terminé</span>`;

                    adminAuctionsTableBody.innerHTML += `
                        <tr class="hover:bg-[#161b26]/40 transition duration-150">
                            <td class="p-4 font-bold text-slate-200">
                                <div class="flex items-center gap-2.5">
                                    ${iconHtml}
                                    <a href="${itemObj ? itemObj.questlogUrl : '#'}" target="_blank" class="hover:text-purple-400 transition">${auc.item_name}</a>
                                </div>
                            </td>
                            <td class="p-4 text-slate-400 text-xs">${formatEventDate(auc.end_time)}</td>
                            <td class="p-4 text-center font-semibold text-slate-300">${bidsCount}</td>
                            <td class="p-4">${statusLabel}</td>
                            <td class="p-4 text-slate-300 font-bold">${auc.winner_name || '--'}</td>
                            <td class="p-4 text-[#38bdf8] font-bold">${auc.winning_bid !== null ? `${auc.winning_bid} pts` : '--'}</td>
                            <td class="p-4 text-center">${actionButtonHtml}</td>
                        </tr>
                    `;
                });
            }
        }

        renderCharts(levelsDistribution, topPlayers);
        renderTeamMaker();

    } catch (err) {
        console.error("Accès refusé au Dashboard :", err);
        switchView('login');
    }
}

// Attribution des points d'activité d'une équipe par l'admin (avec calcul de bonus de Tier)
async function validateEvent(teamId) {
    const team = teamsData.find(t => t.id === teamId);
    if (!team) return;

    let defaultPoints = pointsConfig[team.motif] || 10;

    // Ajout automatique du bonus lié au Tier s'il s'agit d'une épreuve dimensionnelle
    if (team.motif === "Épreuve dimensionnelle" && team.dimensionalTier) {
        defaultPoints += getDimensionalTierBonus(team.dimensionalTier);
    }

    const ptsInput = prompt("Saisissez la valeur de points d'activité à accorder aux membres sélectionnés :", defaultPoints);
    const points = parseInt(ptsInput, 10);

    if (isNaN(points) || points <= 0) {
        alert("Valeur saisie invalide.");
        return;
    }

    if (confirm(`Vous allez distribuer définitivement +${points} points aux participants. Continuer ?`)) {
        let assignedPlayers = [];
        if (team.motif === "Raid") {
            if (team.playersA) assignedPlayers = assignedPlayers.concat(team.playersA);
            if (team.playersB) assignedPlayers = assignedPlayers.concat(team.playersB);
        } else {
            if (team.players) assignedPlayers = assignedPlayers.concat(team.players);
        }

        assignedPlayers = assignedPlayers.filter(p => p && p !== "");

        if (assignedPlayers.length === 0) {
            alert("Aucun joueur assigné.");
            return;
        }

        try {
            const updates = assignedPlayers
                .map(name => allDatabaseMembers.find(m => (m.character_name || m.email) === name))
                .filter(dbMember => dbMember !== undefined)
                .map(dbMember => {
                    const currentPoints = dbMember.points || 0;
                    return supabaseClient
                        .from('member_profiles')
                        .update({ points: currentPoints + points })
                        .eq('id', dbMember.id);
                });

            await Promise.all(updates);

            team.validated = true;
            team.distributedPoints = points;
            await saveTeamsState();

            alert(`Succès ! +${points} points distribués.`);
            loadDashboardData();
        } catch (err) {
            console.error(err);
        }
    }
}

async function deleteMemberAccount(memberId, memberName) {
    if (confirm(`Êtes-vous sûr de vouloir supprimer définitivement le compte de "${memberName}" ?`)) {
        try {
            const { error } = await supabaseClient.rpc('delete_user_by_admin', { target_user_id: memberId });
            if (error) throw error;

            alert(`Le compte de "${memberName}" a été supprimé.`);
            loadDashboardData();
        } catch (err) {
            console.error("Erreur de suppression de compte :", err);
        }
    }
}

async function deletePlayerFromDatabase(playerId, playerName) {
    playerToDeleteId = playerId;
    playerToDeleteName = playerName;

    document.getElementById('confirm-player-name').innerText = playerName;

    const confirmBtn = document.getElementById('btn-confirm-delete');
    confirmBtn.onclick = executeDeletion;

    document.getElementById('confirm-modal').classList.remove('hidden');
}

function closeConfirmModal() {
    document.getElementById('confirm-modal').classList.add('hidden');
    playerToDeleteId = null;
    playerToDeleteName = null;
}

async function executeDeletion() {
    if (!playerToDeleteId) return;

    const confirmBtn = document.getElementById('btn-confirm-delete');
    confirmBtn.disabled = true;
    confirmBtn.innerText = "Suppression...";

    try {
        const { error } = await supabaseClient
            .from('players')
            .delete()
            .eq('id', playerToDeleteId);

        if (error) throw error;

        removePlayerFromAllTeams(playerToDeleteName);
        await saveTeamsState();

        closeConfirmModal();
        alert(`Le joueur "${playerToDeleteName}" a été retiré.`);
        loadDashboardData();
    } catch (err) {
        console.error("Erreur lors de la suppression :", err);
    } finally {
        confirmBtn.disabled = false;
        confirmBtn.innerText = "Supprimer";
    }
}

function openAddEventModal() {
    document.getElementById('add-event-modal')?.classList.remove('hidden');
}

function closeAddEventModal() {
    document.getElementById('add-event-modal')?.classList.add('hidden');
    document.getElementById('add-event-form')?.reset();
    document.getElementById('raid-difficulty-container')?.classList.add('hidden');
    document.getElementById('dimensional-tier-container')?.classList.add('hidden');

    const diffSelect = document.getElementById('event-raid-difficulty');
    if (diffSelect) diffSelect.required = false;
    const tierSelect = document.getElementById('event-dimensional-tier');
    if (tierSelect) tierSelect.required = false;
}

async function submitAddEventForm(event) {
    event.preventDefault();
    const name = document.getElementById('event-name').value.trim();
    const dateVal = document.getElementById('event-date').value;
    const motif = document.getElementById('event-motif').value;
    const gsLimit = parseInt(document.getElementById('event-gs-limit').value, 10) || 0; 

    let raidDifficulty = null;
    if (motif === 'Raid') {
        raidDifficulty = document.getElementById('event-raid-difficulty').value;
    }

    let dimensionalTier = null;
    if (motif === 'Épreuve dimensionnelle') {
        dimensionalTier = document.getElementById('event-dimensional-tier').value;
    }

    if (motif === "Boss de guilde") {
        const totalActiveMembers = allDatabaseMembers ? allDatabaseMembers.length : 0;
        let numGroups = Math.ceil(totalActiveMembers / 6);
        if (numGroups < 1) numGroups = 1;

        const baseId = Date.now();
        for (let g = 1; g <= numGroups; g++) {
            const suffix = numGroups > 1 ? ` - Groupe ${g}` : "";
            const newEvent = {
                id: `event-${baseId}-${g}`,
                name: `${name}${suffix}`,
                date: dateVal,
                motif: motif,
                raidDifficulty: null, 
                dimensionalTier: null,
                gearScoreLimit: gsLimit, 
                players: [],
                applications: [],
                validated: false
            };
            teamsData.push(newEvent);
        }

        await saveTeamsState();

        if (notificationsEnabled) {
            const notificationName = numGroups > 1 ? `${name} (${numGroups} Groupes)` : name;
            await sendDiscordNotification(notificationName, dateVal, motif, gsLimit);
        }

        if (supabaseClient) {
            try {
                const extraNotice = gsLimit > 0 ? ` (Requis: ${gsLimit} GS)` : "";
                const groupsNotice = numGroups > 1 ? ` (${numGroups} groupes créés)` : "";
                await supabaseClient
                    .from('notifications')
                    .insert([{ 
                        message: `Nouvelle activité créée : "${name}" (${motif})${groupsNotice} prévue le ${formatEventDate(dateVal)}${extraNotice} !`,
                        event_id: `event-${baseId}-1`
                    }]);
            } catch (err) {
                console.error("Échec de création de la notification :", err);
            }
        }
    } else {
        const newEvent = {
            id: "event-" + Date.now(),
            name: name,
            date: dateVal,
            motif: motif,
            raidDifficulty: raidDifficulty, 
            dimensionalTier: dimensionalTier,
            gearScoreLimit: gsLimit, 
            players: [],
            playersA: [],
            playersB: [],
            applications: [],
            validated: false
        };

        teamsData.push(newEvent);
        await saveTeamsState();

        if (notificationsEnabled) {
            let motifLabel = motif;
            if (motif === 'Raid' && raidDifficulty) {
                motifLabel = `${motif} (${raidDifficulty})`;
            } else if (motif === 'Épreuve dimensionnelle' && dimensionalTier) {
                motifLabel = `${motif} (${dimensionalTier})`;
            }
            await sendDiscordNotification(name, dateVal, motifLabel, gsLimit);
        }

        if (supabaseClient) {
            try {
                const extraNotice = gsLimit > 0 ? ` (Requis: ${gsLimit} GS)` : "";
                const motifText = dimensionalTier ? `${motif} (${dimensionalTier})` : (raidDifficulty ? `${motif} (${raidDifficulty})` : motif);
                await supabaseClient
                    .from('notifications')
                    .insert([{ 
                        message: `Nouvelle activité créée : "${name}" (${motifText}) prévue le ${formatEventDate(dateVal)}${extraNotice} !`,
                        event_id: newEvent.id
                    }]);
            } catch (err) {
                console.error("Échec de création de la notification :", err);
            }
        }
    }

    closeAddEventModal();
    renderTeamMaker();
}

function removePlayerFromAllTeams(playerName) {
    teamsData.forEach(team => {
        if (team.players) team.players = team.players.filter(p => p !== playerName);
        if (team.playersA) team.playersA = team.playersA.filter(p => p !== playerName);
        if (team.playersB) team.playersB = team.playersB.filter(p => p !== playerName);
    });
}

function removePlayerFromCurrentTeam(playerName, teamId) {
    const team = teamsData.find(t => t.id === teamId);
    if (!team) return;
    if (team.players) team.players = team.players.filter(p => p !== playerName);
    if (team.playersA) team.playersA = team.playersA.filter(p => p !== playerName);
    if (team.playersB) team.playersB = team.playersB.filter(p => p !== playerName);
}

function dragPlayer(event, playerName, teamId) {
    const dragData = { playerName, teamId };
    event.dataTransfer.setData("application/json", JSON.stringify(dragData));
}

function allowDrop(event) {
    event.preventDefault();
}

async function dropToTeam(event, teamId) {
    event.preventDefault();
    try {
        const dataStr = event.dataTransfer.getData("application/json");
        if (!dataStr) return;
        const { playerName, teamId: sourceTeamId } = JSON.parse(dataStr);

        if (sourceTeamId !== teamId) {
            alert("Vous ne pouvez glisser-déposer un joueur que dans le cadre de sa propre activité.");
            return;
        }

        const teamIndex = teamsData.findIndex(t => t.id === teamId);
        if (teamIndex !== -1) {
            if (!teamsData[teamIndex].players) teamsData[teamIndex].players = [];
            if (teamsData[teamIndex].players.includes(playerName)) return;

            if (teamsData[teamIndex].players.length >= 6) {
                alert("Cette équipe est pleine.");
                return;
            }

            removePlayerFromCurrentTeam(playerName, teamId); 
            teamsData[teamIndex].players.push(playerName);
            await saveTeamsState();
            renderTeamMaker();
        }
    } catch (err) {
        console.error("Erreur dropToTeam :", err);
    }
}

async function dropToRaidGroup(event, teamId, groupLetter) {
    event.preventDefault();
    try {
        const dataStr = event.dataTransfer.getData("application/json");
        if (!dataStr) return;
        const { playerName, teamId: sourceTeamId } = JSON.parse(dataStr);

        if (sourceTeamId !== teamId) {
            alert("Vous ne pouvez glisser-déposer un joueur que dans le cadre de sa propre activité.");
            return;
        }

        const teamIndex = teamsData.findIndex(t => t.id === teamId);
        if (teamIndex !== -1) {
            const groupKey = groupLetter === 'A' ? 'playersA' : 'playersB';
            if (!teamsData[teamIndex][groupKey]) teamsData[teamIndex][groupKey] = [];

            if (teamsData[teamIndex][groupKey].includes(playerName)) return;

            if (teamsData[teamIndex][groupKey].length >= 6) {
                alert(`Le Groupe ${groupLetter} est complet.`);
                return;
            }

            removePlayerFromCurrentTeam(playerName, teamId); 
            teamsData[teamIndex][groupKey].push(playerName);
            await saveTeamsState();
            renderTeamMaker();
        }
    } catch (err) {
        console.error("Erreur dropToRaidGroup :", err);
    }
}

async function dropToPool(event, teamId) {
    event.preventDefault();
    try {
        const dataStr = event.dataTransfer.getData("application/json");
        if (!dataStr) return;
        const { playerName, teamId: sourceTeamId } = JSON.parse(dataStr);

        if (sourceTeamId !== teamId) {
            alert("Vous ne pouvez glisser-déposer un joueur que dans le cadre de sa propre activité.");
            return;
        }

        removePlayerFromCurrentTeam(playerName, teamId); 
        await saveTeamsState();
        renderTeamMaker();
    } catch (err) {
        console.error("Erreur dropToPool :", err);
    }
}

async function renameTeam(teamId, newName) {
    const teamIndex = teamsData.findIndex(t => t.id === teamId);
    if (teamIndex !== -1) {
        teamsData[teamIndex].name = newName.trim() || `Équipe ${teamIndex + 1}`;
        await saveTeamsState();
    }
}

function renderTeamMaker() {
    if (allDatabaseMembers && allDatabaseMembers.length > 0) {
        teamsData.forEach(team => {
            if (team.players) {
                team.players = team.players.filter(playerName => 
                    allDatabaseMembers.some(dbM => (dbM.character_name || dbM.email) === playerName)
                );
            }
            if (team.playersA) {
                team.playersA = team.playersA.filter(playerName => 
                    allDatabaseMembers.some(dbM => (dbM.character_name || dbM.email) === playerName)
                );
            }
            if (team.playersB) {
                team.playersB = team.playersB.filter(playerName => 
                    allDatabaseMembers.some(dbM => (dbM.character_name || dbM.email) === playerName)
                );
            }
        });
    }

    const teamsContainer = document.getElementById('teams-container');
    if (!teamsContainer) return;
    teamsContainer.innerHTML = "";

    teamsData.forEach(team => {
        let appsHtml = "";
        if (team.applications && team.applications.length > 0) {
            team.applications.forEach(app => {
                if (!isPlayerAssignedToTeam(app.name, team.id)) {
                    let roleIcon = '<i data-lucide="shield" class="w-3.5 h-3.5 text-blue-400"></i>';
                    if (app.role === 'DPS') roleIcon = '<i data-lucide="swords" class="w-3.5 h-3.5 text-red-400"></i>';
                    if (app.role === 'Healer') roleIcon = '<i data-lucide="heart" class="w-3.5 h-3.5 text-emerald-400"></i>';
                    
                    const dbMember = allDatabaseMembers.find(dbM => (dbM.character_name || dbM.email) === app.name);
                    const weaponsHtml = dbMember ? getWeaponIcon(dbMember.weapon1) + getWeaponIcon(dbMember.weapon2) : "";
                    const memberGsLabel = dbMember ? `<span class="text-[9px] text-amber-500 font-bold ml-1">${dbMember.gear_score || 0} GS</span>` : "";

                    appsHtml += `
                        <div draggable="true" ondragstart="dragPlayer(event, '${app.name}', '${team.id}')" class="bg-[#111622] border border-[#1e2638] p-2 rounded-lg cursor-grab active:cursor-grabbing flex items-center justify-between gap-1.5 transition text-xs">
                            <div class="flex items-center gap-1.5">
                                ${roleIcon}
                                <span class="font-bold text-white truncate max-w-[80px]">${app.name}</span>
                                ${memberGsLabel}
                            </div>
                            <div class="flex items-center gap-1 shrink-0">${weaponsHtml}</div>
                        </div>
                    `;
                }
            });
        }
        if (appsHtml === "") {
            appsHtml = `<div class="p-3 text-center text-slate-600 text-xs italic select-none">Aucun postulant</div>`;
        }

        let validationButtonHtml = "";
        if (team.validated) {
            validationButtonHtml = `
                <div class="text-[10px] bg-emerald-950/20 border border-emerald-500/20 text-emerald-400 px-3 py-1.5 rounded-lg font-bold flex items-center justify-center gap-1">
                    <i class="w-3.5 h-3.5" data-lucide="check"></i> Validé (+${team.distributedPoints || 10} pts)
                </div>
            `;
        } else {
            let calculatedBase = pointsConfig[team.motif] || 10;
            if (team.motif === "Épreuve dimensionnelle" && team.dimensionalTier) {
                calculatedBase += getDimensionalTierBonus(team.dimensionalTier);
            }
            validationButtonHtml = `
                <button onclick="validateEvent('${team.id}')" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-1.5 px-3 rounded-lg text-[10px] transition flex items-center justify-center gap-1">
                    <i class="w-3.5 h-3.5" data-lucide="award"></i> Valider & Distribuer (${calculatedBase} pts)
                </button>
            `;
        }

        let gsBadgeHtml = "";
        if (team.gearScoreLimit && team.gearScoreLimit > 0) {
            gsBadgeHtml = `
                <span class="text-[9px] px-2 py-0.5 rounded border border-red-500/20 bg-red-500/10 text-red-400 font-extrabold tracking-wide uppercase flex items-center gap-1 font-sans">
                    <i data-lucide="shield-alert" class="w-3 h-3"></i> Requis: ${team.gearScoreLimit} GS
                </span>
            `;
        }

        if (team.motif === "Raid") {
            let slotsAHtml = "";
            let slotsBHtml = "";
            for (let i = 0; i < 6; i++) {
                const pA = team.playersA ? team.playersA[i] : null;
                if (pA) {
                    const dbMember = allDatabaseMembers.find(dbM => (dbM.character_name || dbM.email) === pA);
                    const icons = dbMember ? getWeaponIcon(dbMember.weapon1) + getWeaponIcon(dbMember.weapon2) : "";
                    slotsAHtml += `
                        <div draggable="true" ondragstart="dragPlayer(event, '${pA}', '${team.id}')" class="bg-[#111622] border border-[#252f44] p-2 rounded-lg cursor-grab active:cursor-grabbing flex items-center justify-between gap-1.5 transition text-xs">
                            <span class="font-bold text-white truncate max-w-[100px]">${pA}</span>
                            <div class="flex items-center gap-1 shrink-0">${icons}</div>
                        </div>
                    `;
                } else {
                    slotsAHtml += `<div class="border border-dashed border-[#1e2638] p-2 rounded-lg text-center text-slate-700 text-[10px] select-none">Vide</div>`;
                }

                const pB = team.playersB ? team.playersB[i] : null;
                if (pB) {
                    const dbMember = allDatabaseMembers.find(dbM => (dbM.character_name || dbM.email) === pB);
                    const icons = dbMember ? getWeaponIcon(dbMember.weapon1) + getWeaponIcon(dbMember.weapon2) : "";
                    slotsBHtml += `
                        <div draggable="true" ondragstart="dragPlayer(event, '${pB}', '${team.id}')" class="bg-[#111622] border border-[#252f44] p-2 rounded-lg cursor-grab active:cursor-grabbing flex items-center justify-between gap-1.5 transition text-xs">
                            <span class="font-bold text-white truncate max-w-[100px]">${pB}</span>
                            <div class="flex items-center gap-1 shrink-0">${icons}</div>
                        </div>
                    `;
                } else {
                    slotsBHtml += `<div class="border border-dashed border-[#1e2638] p-2 rounded-lg text-center text-slate-700 text-[10px] select-none">Vide</div>`;
                }
            }

            let raidBadgeClass = "bg-pink-500/10 text-pink-400 border-pink-500/20";
            const difficultyText = team.raidDifficulty || "Raid Normal";
            if (difficultyText === "Raid Hardcore") {
                raidBadgeClass = "bg-red-500/10 text-red-400 border-red-500/20";
            } else if (difficultyText === "Raid Nightmare") {
                raidBadgeClass = "bg-purple-600/10 text-purple-600/20";
            }

            teamsContainer.innerHTML += `
                <div class="col-span-full bg-[#161b26]/50 border border-[#1e2638] rounded-xl p-5 space-y-4 animate-fade-in">
                    <div class="flex justify-between items-center border-b border-[#1e2638] pb-3 flex-wrap gap-2">
                        <div class="flex items-center gap-3">
                            <span class="text-xs px-2.5 py-1 rounded-full border ${raidBadgeClass} font-bold uppercase tracking-wider">${difficultyText}</span>
                            <input type="text" value="${team.name}" onchange="renameTeam('${team.id}', this.value)" class="bg-transparent font-bold text-sm text-slate-200 outline-none focus:border-b focus:border-blue-500/50 w-48">
                            <span class="text-xs text-slate-500">${formatEventDate(team.date)}</span>
                            ${gsBadgeHtml}
                        </div>
                        <div class="flex items-center gap-2">
                            ${validationButtonHtml}
                            <button onclick="deleteTeam('${team.id}')" class="text-slate-500 hover:text-red-400 transition" title="Supprimer l'événement">
                                <i data-lucide="trash-2" class="w-4 h-4"></i>
                            </button>
                        </div>
                    </div>
                    
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div ondragover="allowDrop(event)" ondrop="dropToPool(event, '${team.id}')" class="bg-[#0b0e14]/40 border border-[#1e2638] rounded-xl p-4 space-y-3">
                            <span class="text-xs font-bold text-slate-300 block border-b border-[#1e2638] pb-1.5 uppercase tracking-wider">Membres Postulés</span>
                            <div class="flex flex-col gap-2 max-h-[460px] overflow-y-auto">${appsHtml}</div>
                        </div>
                        <div ondragover="allowDrop(event)" ondrop="dropToRaidGroup(event, '${team.id}', 'A')" class="bg-[#0b0e14]/40 border border-[#1e2638] rounded-xl p-4 space-y-3">
                            <h5 class="text-xs font-bold text-slate-300 flex justify-between border-b border-[#1e2638] pb-1.5">
                                <span>GROUPE A</span>
                                <span class="text-slate-500 font-bold">${team.playersA ? team.playersA.length : 0}/6</span>
                            </h5>
                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">${slotsAHtml}</div>
                        </div>
                        <div ondragover="allowDrop(event)" ondrop="dropToRaidGroup(event, '${team.id}', 'B')" class="bg-[#0b0e14]/40 border border-[#1e2638] rounded-xl p-4 space-y-3">
                            <h5 class="text-xs font-bold text-slate-300 flex justify-between border-b border-[#1e2638] pb-1.5">
                                <span>GROUPE B</span>
                                <span class="text-slate-500 font-bold">${team.playersB ? team.playersB.length : 0}/6</span>
                            </h5>
                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">${slotsBHtml}</div>
                        </div>
                    </div>
                </div>
            `;
        } else {
            let teamSlotsHtml = "";
            let badgeColor = "bg-blue-500/10 text-blue-400 border-blue-500/20";
            let labelText = team.motif;
            if (team.motif === "PVP") {
                badgeColor = "bg-purple-500/10 text-purple-400 border-purple-500/20";
            } else if (team.motif === "Boss de guilde") {
                badgeColor = "bg-amber-500/10 text-amber-400 border-amber-500/20";
            } else if (team.motif === "Épreuve dimensionnelle") {
                badgeColor = "bg-cyan-500/10 text-cyan-400 border-cyan-500/20";
                if (team.dimensionalTier) {
                    labelText = `Épreuve (${team.dimensionalTier})`;
                }
            }

            for (let i = 0; i < 6; i++) {
                const playerName = team.players ? team.players[i] : null;
                if (playerName) {
                    const dbMember = allDatabaseMembers.find(dbM => (dbM.character_name || dbM.email) === playerName);
                    let iconsHtml = "";
                    if (dbMember) {
                        iconsHtml = getWeaponIcon(dbMember.weapon1) + getWeaponIcon(dbMember.weapon2);
                    }

                    teamSlotsHtml += `
                        <div id="drag-${playerName}" draggable="true" ondragstart="dragPlayer(event, '${playerName}', '${team.id}')" class="bg-[#111622] border border-[#252f44] p-2 rounded-lg cursor-grab active:cursor-grabbing flex items-center justify-between gap-1.5 transition">
                            <span class="font-bold text-white truncate text-xs max-w-[100px]">${playerName}</span>
                            <div class="flex items-center gap-1 shrink-0">
                                ${iconsHtml}
                            </div>
                        </div>
                    `;
                } else {
                    teamSlotsHtml += `
                        <div class="border border-dashed border-[#1e2638] p-2 rounded-lg text-center text-slate-600 text-xs select-none">
                            Vide
                        </div>
                    `;
                }
            }

            teamsContainer.innerHTML += `
                <div class="col-span-full xl:col-span-1 bg-[#161b26]/50 border border-[#1e2638] rounded-xl p-5 space-y-4 animate-fade-in">
                    <div class="flex justify-between items-center border-b border-[#1e2638] pb-3 flex-wrap gap-2">
                        <div class="flex flex-col gap-1 w-full sm:w-auto">
                            <div class="flex items-center gap-2">
                                <span class="text-[9px] px-2 py-0.5 rounded border ${badgeColor} font-bold uppercase tracking-wider">${labelText}</span>
                                <input type="text" value="${team.name}" onchange="renameTeam('${team.id}', this.value)" class="bg-transparent font-bold text-xs text-slate-200 outline-none focus:border-b focus:border-blue-500/50 w-32">
                            </div>
                            <span class="text-[10px] text-slate-500">${formatEventDate(team.date)}</span>
                        </div>
                        <div class="flex items-center gap-2 flex-shrink-0">
                            ${validationButtonHtml}
                            <button onclick="deleteTeam('${team.id}')" class="text-slate-500 hover:text-red-400 transition" title="Supprimer l'équipe">
                                <i data-lucide="trash-2" class="w-4 h-4"></i>
                            </button>
                        </div>
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div ondragover="allowDrop(event)" ondrop="dropToPool(event, '${team.id}')" class="bg-[#0b0e14]/40 border border-[#1e2638] rounded-xl p-3.5 space-y-2">
                            <div class="flex justify-between items-center border-b border-[#1e2638] pb-1.5">
                                <span class="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Membres Postulés</span>
                                ${gsBadgeHtml}
                            </div>
                            <div class="flex flex-col gap-2 max-h-[220px] overflow-y-auto">
                                ${appsHtml}
                            </div>
                        </div>
                        
                        <div ondragover="allowDrop(event)" ondrop="dropToTeam(event, '${team.id}')" class="bg-[#0b0e14]/40 border border-[#1e2638] rounded-xl p-3.5 space-y-2">
                            <div class="flex justify-between items-center border-b border-[#1e2638] pb-1.5">
                                <span class="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Composition</span>
                                <span class="text-[10px] text-slate-500 font-bold">${team.players ? team.players.length : 0} / 6</span>
                            </div>
                            <div class="space-y-1.5">${teamSlotsHtml}</div>
                        </div>
                    </div>
                </div>
            `;
        }
    });

    lucide.createIcons();
}

function openInfoModal(playerId) {
    const player = allDatabasePlayers.find(p => p.id === playerId);
    if (!player) return;

    document.getElementById('modal-player-name').innerText = player.name;
    document.getElementById('modal-player-score').innerText = player.score;
    document.getElementById('modal-player-level').innerText = player.calculated_level;

    const dateFormatted = new Date(player.created_at).toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
    document.getElementById('modal-submit-date').innerText = dateFormatted;

    const answersList = document.getElementById('modal-answers-list');
    answersList.innerHTML = "";

    for (let i = 1; i <= 7; i++) {
        const responseValue = player[`q${i}`];
        const qMap = QUESTIONS_MAPPING[`q${i}`];
        
        let answerText = "Information indisponible.";
        if (responseValue && qMap && qMap.options[responseValue]) {
            answerText = qMap.options[responseValue];
        }

        answersList.innerHTML += `
            <div class="bg-[#161b26] border border-[#1e2638] p-4 rounded-xl space-y-1">
                <h4 class="text-xs font-bold text-slate-400 uppercase tracking-wide">${qMap.title}</h4>
                <p class="text-sm text-white font-semibold">${answerText}</p>
            </div>
        `;
    }

    answersList.innerHTML += `
        <div class="bg-[#ff3355]/5 border border-[#ff3355]/20 p-4 rounded-xl space-y-1">
            <h4 class="text-xs font-bold text-[#ff3355] uppercase tracking-wide">Groupe Souhaité par le Joueur</h4>
            <p class="text-sm text-white font-bold">${player.desired_level}</p>
        </div>
    `;

    const modal = document.getElementById('info-modal');
    modal.classList.remove('hidden');
    lucide.createIcons();
}

function closeInfoModal() {
    document.getElementById('info-modal').classList.add('hidden');
}

function renderCharts(distribution, topPlayers) {
    const ctxPie = document.getElementById('chart-pie').getContext('2d');
    if (pieChartInstance) pieChartInstance.destroy();

    pieChartInstance = new Chart(ctxPie, {
        type: 'doughnut',
        data: {
            labels: Object.keys(distribution),
            datasets: [{
                data: Object.values(distribution),
                backgroundColor: ['#3b82f6', '#eab308', '#f97316', '#ff3355'],
                borderWidth: 0,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 400 },
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: '#94a3b8',
                        font: { size: 12 },
                        padding: 15,
                        boxWidth: 12
                    }
                }
            },
            cutout: '70%'
        }
    });

    const ctxBar = document.getElementById('chart-bar').getContext('2d');
    if (barChartInstance) barChartInstance.destroy();

    const barLabels = topPlayers.map(p => p.name);
    const barData = topPlayers.map(p => p.score);

    barChartInstance = new Chart(ctxBar, {
        type: 'bar',
        data: {
            labels: barLabels,
            datasets: [{
                label: 'Score',
                data: barData,
                backgroundColor: '#ff3355',
                borderRadius: 6,
                barThickness: 16
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 400 },
            plugins: {
                legend: { display: false }
            },
            scales: {
                x: {
                    grid: { color: '#1e2638' },
                    ticks: { color: '#94a3b8' },
                    max: 28,
                    min: 0
                },
                y: {
                    grid: { display: false },
                    ticks: { color: '#94a3b8' }
                }
            }
        }
    });
}

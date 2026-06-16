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
let dashboardAutoRefreshInterval = null;
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

// Trouver un équipement par son nom
function findItemByName(name) {
    if (!name) return null;
    return TL_ITEMS_DB.find(item => item.name.toLowerCase().trim() === name.toLowerCase().trim()) || null;
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

// Envoi de la notification sur Discord via Webhook
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
            description: `Un nouvel événement de guilde vient d'être planifié ! Rendez-vous sur votre espace membre pour postuler.`,
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
        console.log("Notification Discord envoyée avec succès.");
    } catch (err) {
        console.error("Échec de l'envoi Discord :", err);
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
            2: "B. Je m'adapte après quelques essais.",
            3: "C. Je m'adaptes rapidement.",
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
    await loadFormStatus();
    
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
    
    const urlParams = new URLSearchParams(window.location.search);
    const inviteToken = urlParams.get('invite');
    
    if (inviteToken) {
        verifyAndShowInvite(inviteToken);
    } else {
        if (supabaseClient) {
            const { data: { session } } = await supabaseClient.auth.getSession();
            updateUIVisibility(session);
            subscribeToRealtimeTeams(); 
            if (session) {
                if (session.user.email === ADMIN_EMAIL) {
                    switchView('dashboard');
                } else {
                    switchView('members');
                }
            }
        }
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

function subscribeToRealtimeTeams() {
    if (!supabaseClient) return;

    if (teamsChannel) {
        supabaseClient.removeChannel(teamsChannel);
    }

    teamsChannel = supabaseClient
        .channel('public:guild_teams')
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'guild_teams' }, async (payload) => {
            console.log("Mise à jour d'équipe reçue en direct :", payload);
            
            const dashboardSection = document.getElementById('view-dashboard');
            if (dashboardSection && !dashboardSection.classList.contains('hidden')) {
                await loadDashboardData();
            }

            const membersSection = document.getElementById('view-members');
            if (membersSection && !membersSection.classList.contains('hidden')) {
                await loadMembersViewData();
            }
        })
        .subscribe();
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

    if (dashboardAutoRefreshInterval) {
        clearInterval(dashboardAutoRefreshInterval);
        dashboardAutoRefreshInterval = null;
    }

    setTabActive('nav-form', view === 'form');
    setTabActive('nav-login', view === 'login');
    setTabActive('nav-dashboard', view === 'dashboard');
    setTabActive('nav-

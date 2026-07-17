/**
 * Génère js/items.js à partir de la base d'objets publique de Questlog.
 *
 * Pourquoi un script plutôt qu'un fichier maintenu à la main :
 * la liste changeait à chaque patch et devait être classée manuellement
 * (type, rareté, icône), ce qui laissait passer des erreurs.
 *
 * L'API interrogée est interne à Questlog et n'est pas documentée : elle peut
 * changer sans préavis. C'est pourquoi elle n'est utilisée qu'ICI, pour produire
 * un fichier statique. Le site, lui, ne dépend jamais de cette API à l'exécution.
 *
 * Usage :  node tools/fetch-items.js
 */

const fs = require('fs');
const path = require('path');

const API = 'https://questlog.gg/throne-and-liberty/api/trpc/database.getItems';
const LANGUE = 'fr';
const CATEGORIES = ['weapons', 'armor', 'accessories'];
const GRADES = [41, 51]; // 41 = épique, 51 = légendaire (seuls pertinents pour les enchères)

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

async function getPage(mainCategory, page, grade) {
    const input = encodeURIComponent(JSON.stringify({
        language: LANGUE,
        page,
        mainCategory,
        subCategory: '',
        facets: { grade }
    }));
    const res = await fetch(`${API}?input=${input}`, {
        headers: { 'accept': 'application/json' }
    });
    if (!res.ok) throw new Error(`${mainCategory} grade=${grade} page=${page} -> HTTP ${res.status}`);
    const json = await res.json();
    const data = json.result?.data ?? json.result ?? json;
    if (!Array.isArray(data.pageData)) throw new Error(`Réponse inattendue pour ${mainCategory} p${page}`);
    return data;
}

async function collecter() {
    const items = [];
    for (const cat of CATEGORIES) {
        for (const grade of GRADES) {
            const first = await getPage(cat, 1, grade);
            items.push(...first.pageData);
            for (let p = 2; p <= first.pageCount; p++) {
                await pause(350); // on reste courtois avec leur API
                const d = await getPage(cat, p, grade);
                items.push(...d.pageData);
            }
            console.log(`  ${cat} / grade ${grade} : ${first.pageCount} page(s)`);
            await pause(350);
        }
    }
    return items;
}

// Le champ icon vaut "/chemin/NOM.NOM" ; le CDN sert "/chemin/NOM.webp"
function cheminIcone(icon) {
    const dossier = icon.slice(0, icon.lastIndexOf('/'));
    const fichier = icon.slice(icon.lastIndexOf('/') + 1).split('.')[0];
    return `${dossier}/${fichier}.webp`;
}

function genererFichier(items) {
    // Dédoublonnage par slug, puis tri stable (catégorie, sous-catégorie, nom)
    const parId = new Map();
    for (const it of items) {
        if (it.isDisabled) continue;
        if (!parId.has(it.id)) parId.set(it.id, it);
    }
    const tries = [...parId.values()].sort((a, b) =>
        a.mainCategory.localeCompare(b.mainCategory) ||
        a.subCategory.localeCompare(b.subCategory) ||
        a.name.localeCompare(b.name, 'fr')
    );

    const lignes = tries.map((it) => {
        const nom = it.name.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        return `    { id: "${it.id}", name: "${nom}", grade: ${it.grade}, cat: "${it.mainCategory}", sub: "${it.subCategory}", icon: "${cheminIcone(it.icon)}" }`;
    });

    return `// BASE DE DONNÉES DES ÉQUIPEMENTS ÉPIQUES & LÉGENDAIRES DE THRONE AND LIBERTY
//
// FICHIER GÉNÉRÉ — NE PAS ÉDITER À LA MAIN.
// Régénérer avec :  node tools/fetch-items.js
//
// Généré le ${new Date().toISOString().slice(0, 10)} — ${tries.length} objets (langue : ${LANGUE}).
// Champs : id = slug Questlog, grade 41 = épique / 51 = légendaire,
//          cat/sub = catégories Questlog, icon = chemin relatif sur leur CDN.
// L'URL de la fiche et celle de l'icône se déduisent de id/icon (cf. js/app.js).

const TL_ITEMS_DB = [
${lignes.join(',\n')}
];
`;
}

(async () => {
    console.log('Récupération de la base Questlog…');
    const items = await collecter();
    const contenu = genererFichier(items);
    const dest = path.join(__dirname, '..', 'js', 'items.js');
    fs.writeFileSync(dest, contenu, 'utf8');
    const nb = (contenu.match(/^\s{4}\{ id:/gm) || []).length;
    console.log(`\nÉcrit ${dest}`);
    console.log(`${nb} objets, ${(contenu.length / 1024).toFixed(0)} Ko.`);
})().catch((err) => {
    console.error('Échec de la génération :', err.message);
    process.exit(1);
});

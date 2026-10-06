/*
 * Cyber Watch — relais « Lancer une mise à jour » sans compte GitHub (Cloudflare Worker, gratuit).
 *
 * Le site est public : il ne peut pas contenir de jeton GitHub. Ce petit programme, hébergé
 * chez Cloudflare, garde le jeton en SECRET et lance la collecte à la place de l'utilisateur.
 *
 *   GET  /etat     état de la dernière collecte (en cours ? étape ? fin estimée ?)
 *   POST /lancer   lance une collecte, si aucune n'est en cours et si les limites le permettent
 *
 * Réglages (Cloudflare › Workers › ce worker › Settings › Variables) :
 *   GITHUB_TOKEN   SECRET — jeton « fine-grained » limité au dépôt, droit « Actions : Read and write »
 *   DEPOT          ex. mon-organisation/cyberwatch
 *   WORKFLOW       veille.yml
 *   BRANCHE        main
 *   SITE_ORIGINE   adresse du site autorisé à appeler le relais, ex. https://mon-organisation.github.io
 *   MAX_PAR_JOUR   (facultatif) collectes lancées depuis le site par 24 h, défaut 3
 *   CODE_ACCES     (facultatif) code partagé demandé avant de lancer ; vide = pas de code
 *
 * Aucune donnée personnelle n'est lue ni stockée. Les limites sont calculées à partir de
 * l'historique des collectes GitHub (pas de base de données).
 */

const API = 'https://api.github.com';

function entetesCors(env) {
  return {
    'Access-Control-Allow-Origin': env.SITE_ORIGINE || '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  };
}

function reponse(env, statut, corps) {
  return new Response(JSON.stringify(corps), { status: statut, headers: entetesCors(env) });
}

async function gh(env, chemin, options = {}) {
  const r = await fetch(API + chemin, {
    ...options,
    headers: {
      Authorization: 'Bearer ' + env.GITHUB_TOKEN,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'cyberwatch-relais',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  if (r.status === 204) return {};
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(json.message || 'GitHub ' + r.status), { statut: r.status });
  return json;
}

const EN_COURS = ['queued', 'in_progress', 'waiting', 'requested', 'pending'];

async function etat(env) {
  const runs = (await gh(env, `/repos/${env.DEPOT}/actions/workflows/${env.WORKFLOW}/runs?per_page=10`)).workflow_runs || [];
  const actif = runs.find((r) => EN_COURS.includes(r.status));
  // durée de la dernière vraie collecte réussie (> 2 min) : sert à estimer l'heure de fin
  const ok = runs.find((r) => r.conclusion === 'success' && (new Date(r.updated_at) - new Date(r.run_started_at)) > 120000);
  const duree = ok ? Math.round((new Date(ok.updated_at) - new Date(ok.run_started_at)) / 1000) : null;
  const res = { en_cours: !!actif, duree_habituelle_s: duree };
  if (actif) {
    const jobs = (await gh(env, `/repos/${env.DEPOT}/actions/runs/${actif.id}/jobs`)).jobs || [];
    res.collecte = {
      id: actif.id, statut: actif.status, debut: actif.run_started_at || actif.created_at,
      declenchement: actif.event === 'schedule' ? 'automatique' : 'manuel',
      etapes: (jobs[0] && jobs[0].steps || []).map((s) => ({ nom: s.name, statut: s.status, conclusion: s.conclusion })),
    };
  } else if (runs[0]) {
    res.derniere = { fin: runs[0].updated_at, conclusion: runs[0].conclusion };
  }
  return res;
}

async function lancer(env, requete) {
  if (env.CODE_ACCES) {
    const corps = await requete.json().catch(() => ({}));
    if ((corps.code || '') !== env.CODE_ACCES) return reponse(env, 403, { erreur: 'code', message: "Code d'accès incorrect." });
  }
  const runs = (await gh(env, `/repos/${env.DEPOT}/actions/workflows/${env.WORKFLOW}/runs?per_page=30`)).workflow_runs || [];
  if (runs.some((r) => EN_COURS.includes(r.status))) {
    return reponse(env, 409, { erreur: 'en_cours', message: 'Une collecte est déjà en cours.' });
  }
  const maintenant = Date.now();
  const manuels = runs.filter((r) => r.event === 'workflow_dispatch');
  if (manuels.some((r) => maintenant - new Date(r.created_at) < 60 * 60 * 1000)) {
    return reponse(env, 429, { erreur: 'heure', message: 'Une collecte a déjà été lancée il y a moins d’une heure.' });
  }
  const max = parseInt(env.MAX_PAR_JOUR || '3', 10);
  if (manuels.filter((r) => maintenant - new Date(r.created_at) < 24 * 60 * 60 * 1000).length >= max) {
    return reponse(env, 429, { erreur: 'jour', message: `Limite de ${max} collectes par jour atteinte.` });
  }
  await gh(env, `/repos/${env.DEPOT}/actions/workflows/${env.WORKFLOW}/dispatches`, {
    method: 'POST', body: JSON.stringify({ ref: env.BRANCHE || 'main' }),
  });
  return reponse(env, 202, { ok: true, message: 'Collecte demandée : elle démarre dans quelques secondes.' });
}

export default {
  async fetch(requete, env) {
    if (requete.method === 'OPTIONS') return new Response(null, { status: 204, headers: entetesCors(env) });
    const origine = requete.headers.get('Origin');
    if (env.SITE_ORIGINE && origine && origine !== env.SITE_ORIGINE) return reponse(env, 403, { erreur: 'origine' });
    const chemin = new URL(requete.url).pathname.replace(/\/+$/, '');
    try {
      if (requete.method === 'GET' && chemin === '/etat') return reponse(env, 200, await etat(env));
      if (requete.method === 'POST' && chemin === '/lancer') return await lancer(env, requete);
      return reponse(env, 404, { erreur: 'introuvable' });
    } catch (e) {
      return reponse(env, 502, { erreur: 'github', message: String(e.message || e).slice(0, 200) });
    }
  },
};

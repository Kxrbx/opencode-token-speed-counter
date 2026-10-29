# Token Speed Counter pour OpenCode Desktop

Compteur de tokens par seconde pour **OpenCode Desktop 2.2.1**, ciblé sur **macOS**. Une pastille au-dessus du champ de saisie affiche la vitesse de la dernière requête du modèle :

- Pendant la génération : `≈ 42,3 tok/s · Génération`.
- À la fin : `38,7 tok/s · terminé`.
- Au clic : sortie, raisonnement, total, durée, modèle et origine de la mesure.

L’interface suit la langue et les composants natifs d’OpenCode, en français ou en anglais et dans les thèmes clair et sombre. Aucun appel supplémentaire aux modèles, aucune clé API supplémentaire, aucun historique ni envoi de télémétrie n’est ajouté par l’extension. Elle lit les données déjà synchronisées par Desktop.

## Installation sur macOS

### 1. Prérequis

- OpenCode **Desktop 2.2.1** (vérifier dans « À propos »). L’API graphique est expérimentale : les autres versions ne sont pas annoncées compatibles.
- Node.js **24 LTS** et npm, ainsi que Git. Vérifier dans Terminal :

```bash
node --version
npm --version
git --version
```

Cette V1 s’installe depuis un dossier local compilé. Aucune publication npm ni modification de l’application Desktop n’est nécessaire. Conserver ce dossier à son emplacement après activation.

### 2. Télécharger et compiler

Depuis le dossier permanent de votre choix :

```bash
git clone https://github.com/Kxrbx/opencode-token-speed-counter.git
cd opencode-token-speed-counter
npm ci
npm run build
```

Ne pas recloner si le dossier existe déjà : utiliser les instructions de mise à jour plus bas. Le dépôt distant doit contenir cette implémentation pour que le clonage permette de l’installer.

La compilation doit produire au minimum :

```text
dist/server.js
dist/gui-experimental.cjs
```

Afficher le chemin absolu à utiliser dans la configuration :

```bash
pwd -P
```

Ne pas utiliser un chemin de l’environnement cloud (`/workspace/...`) sur votre Mac.

### 3. Activer globalement — recommandé

Quitter complètement OpenCode Desktop (`⌘Q`). Dans la configuration utilisateur OpenCode, ajouter le chemin absolu du **dossier du paquet**, pas celui de son fichier JavaScript, à la liste `plugins`.

L’emplacement standard est `~/.config/opencode/opencode.jsonc` (ou le fichier `opencode.json` existant). Si `XDG_CONFIG_HOME` est personnalisé, utiliser son sous-dossier `opencode`. Utiliser le fichier déjà présent plutôt que créer une deuxième configuration concurrente.

**Avant toute modification, sauvegarder le fichier existant.** Par exemple, uniquement si vous utilisez ce fichier :

```bash
cp -p ~/.config/opencode/opencode.jsonc ~/.config/opencode/opencode.jsonc.backup-$(date +%Y%m%d-%H%M%S)
```

Exemple minimal à **fusionner** avec votre configuration, en remplaçant le chemin par le résultat de `pwd -P` :

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    "/Users/VOTRE_NOM/Extensions/opencode-token-speed-counter"
  ]
}
```

Conserver les autres plugins et tous les autres réglages. Si la liste `plugins` existe, ajouter une seule entrée, séparée par une virgule. Si ce chemin est déjà présent, ne rien ajouter. En 2.2.1, le champ est bien **`plugins` au pluriel**. Utiliser un chemin absolu, sans `~` ni variable shell à l’intérieur du JSON.

### Variante : activation pour un seul projet

Ajouter la même entrée à `plugins` dans le `opencode.jsonc` du projet (ou son `opencode.json` existant), après sauvegarde, puis ouvrir ce projet dans Desktop. Choisir cette variante **ou** l’installation globale pour éviter une double déclaration. Un chemin personnel absolu ne doit pas être partagé comme configuration commune du projet.

### 4. Vérifier dans Desktop

1. Relancer OpenCode Desktop et ouvrir un projet et une conversation principale.
2. Vérifier que `token-speed-counter` est actif dans **Extensions → Plugins**. Si nécessaire, ouvrir un projet avec la configuration concernée puis redémarrer Desktop.
3. Envoyer une demande générant une réponse de quelques secondes.
4. Vérifier l’affichage de la pastille près de la saisie, puis cliquer dessus pour ouvrir les détails.
5. À la fin, vérifier le bilan : il utilise les compteurs du fournisseur si disponibles ; sinon il conserve le symbole `≈`.

Les pastilles de ce point d’extension ne sont pas affichées par OpenCode dans les conversations de sous-agents. La V1 cible les conversations principales.

L’extension ne modifie jamais votre configuration automatiquement. Répéter les instructions d’activation consiste à vérifier l’entrée existante, sans l’ajouter une seconde fois.

## Mise à jour

Quitter Desktop, puis dans le dossier de l’extension :

```bash
git pull --ff-only
npm ci
npm run build
```

Relancer Desktop. Le chemin configuré reste le même : ne pas ajouter une nouvelle entrée. Si Git signale des modifications locales ou des branches divergentes, les préserver et résoudre la situation avant de poursuivre ; ne pas réinitialiser le dépôt aveuglément. Vérifier les notes de compatibilité avant de mettre à jour OpenCode lui-même.

## Désactivation et désinstallation

Pour suspendre l’affichage, désactiver la partie graphique dans **Extensions → Plugins**. L’entrée serveur du compteur n’ajoute aucun hook de génération.

Pour désinstaller complètement :

1. Quitter Desktop.
2. Retirer uniquement le chemin de cette extension de `plugins`, dans la configuration choisie à l’installation. Conserver les autres entrées et régler les virgules si nécessaire.
3. Relancer Desktop et vérifier que la pastille a disparu et que vos autres plugins fonctionnent.
4. Supprimer éventuellement le dossier local de l’extension.

Aucune clé, donnée de fournisseur ou conversation n’est supprimée. L’extension ne crée pas de données persistantes à nettoyer. Si l’entrée est déjà absente, aucune modification de configuration n’est nécessaire.

## Comprendre les chiffres

### Moyenne finale

```text
(tokens.output + tokens.reasoning) / ((time.streamed - time.created) / 1000)
```

OpenCode 2.2.1 fournit ces catégories de tokens séparément. Le temps inclut l’attente avant le premier token et s’arrête à la fin du flux fournisseur, **avant le règlement des outils**. Il mesure donc le débit de la requête, pas uniquement la cadence après le premier token. Les tokens d’entrée et de cache ne sont pas ajoutés.

Une nouvelle requête après un appel d’outil commence une nouvelle mesure ; le compteur n’additionne pas les requêtes d’un tour ni les sous-agents. Pendant un outil, le bilan de la requête précédente reste figé. Les bilans sont reconstitués depuis les messages synchronisés après redémarrage, sans historique propre à l’extension.

### Pendant la génération

L’estimation prend le nombre de caractères Unicode du texte et du raisonnement reçus, le divise par **4**, puis par la durée écoulée depuis la création de la requête. Rafraîchissement toutes les **250 ms**, uniquement pendant une requête active de la conversation affichée.

Le symbole **`≈` reste obligatoire pour une estimation**. Ce n’est pas un tokenizer propre au modèle : la précision varie avec la langue, le code et le modèle. Le raisonnement caché et les arguments d’outils ne sont pas estimables à partir du texte visible. Le bilan peut donc changer sensiblement lorsque les compteurs réels arrivent.

Si un endpoint local ou un fournisseur ne communique pas de compteurs, la moyenne finale reste estimée. Une durée manquante, nulle ou incohérente affiche « Indisponible » plutôt qu’un débit trompeur. Une requête interrompue sans horodatage de fin de flux ne reçoit pas de moyenne finale inventée. Une déconnexion suspend le débit en cours ; une reconnexion utilise de nouveau les données du serveur.

## Dépannage

| Symptôme | Vérification |
| --- | --- |
| Aucune pastille | Ouvrir une conversation principale ; vérifier le projet, `plugins`, le chemin absolu du dossier, puis l’activation graphique et redémarrer Desktop. |
| Erreur de chargement | Vérifier `dist/server.js` et `dist/gui-experimental.cjs` ; relancer `npm ci` puis `npm run build`. Ne pas déplacer le dossier après activation. |
| « Indisponible » après mise à jour | Cible validée au niveau de l’API : 2.2.1 uniquement. Le menu de la pastille signale une version différente. |
| Le symbole `≈` reste à la fin | Les compteurs finaux sont absents ou invalides. C’est attendu pour certains endpoints ; ne pas saisir de nouvelle clé pour le compteur. |
| Raisonnement sous-estimé en direct | Le fournisseur peut masquer son raisonnement ; seule sa comptabilité finale peut le fournir. |
| « Déconnecté » | Rétablir la connexion d’OpenCode à son serveur ; le compteur réutilise cette connexion. |
| Pas de bilan après interruption | L’horodatage de fin du flux peut manquer ; le temps des outils ou le temps depuis l’arrêt ne sert jamais de remplacement. |
| Installation déclarée deux fois | Garder une seule entrée, globale ou par projet, sans toucher aux autres plugins. |

## Développement et validation

```bash
npm ci
npm run check
```

`check` exécute les types, les tests de calcul et de réactivité, la compilation et un test du paquet extrait dans un dossier temporaire. Ce dernier charge les exports du paquet avec le SDK hôte et simule une pastille passant de la génération au bilan, puis son nettoyage. Les modules OpenCode/Solid sont fournis par l’hôte et ne sont pas embarqués dans le bundle graphique.

Les tests couvrent notamment les doublons de snapshots, l’isolation des serveurs et sessions, les durées invalides, les outils, l’interruption, la reconnexion, les libellés et la suppression des temporisateurs. Ces simulations **ne constituent pas un essai dans Desktop macOS**.

### Recette manuelle macOS 2.2.1 — à exécuter

Pour chacun de **OpenCode Zen/Go**, **OpenRouter** et votre **endpoint local personnalisé**, en utilisant vos connexions existantes :

- [ ] Installer/activer depuis le dossier compilé ; vérifier le chargement graphique.
- [ ] Générer une réponse avec raisonnement si le modèle le permet ; vérifier l’estimation et le menu de détails.
- [ ] Vérifier les compteurs finaux ou le maintien explicite de `≈` lorsque l’endpoint n’en fournit pas.
- [ ] Faire exécuter un outil lent ; vérifier que sa durée ne fait pas baisser la moyenne figée.
- [ ] Interrompre une réponse, changer d’onglet, couper/rétablir la connexion.
- [ ] Quitter puis relancer Desktop ; vérifier le bilan reconstitué et les thèmes clair/sombre.
- [ ] Refaire l’activation sans ajouter de doublon ; vérifier la configuration des autres plugins.
- [ ] Désinstaller puis réinstaller ; vérifier que les autres réglages restent intacts.

La compilation et les tests peuvent être exécutés dans un cloud Linux. La recette ci-dessus nécessite le Mac de l’utilisateur et ses fournisseurs configurés ; ne pas la considérer comme exécutée sur la seule base des tests automatisés.

## Références et limites

- [API graphique 2.2.1 : ComposerPill](https://github.com/anomalyco/opencode/blob/v2.2.1/packages/plugin/src/gui/registries.ts)
- [Compilation graphique officielle](https://github.com/anomalyco/opencode/blob/v2.2.1/packages/plugin/src/gui/vite.ts)
- [Exemple officiel d’installation locale via plugins](https://github.com/anomalyco/opencode/blob/v2.2.1/packages/plugins/figma/README.md)

Pas de coûts, statistiques globales, graphiques, historique supplémentaire ou publication automatique dans cette V1. La présence de l’API dans 2.2.1 et la compilation contre son SDK ne garantissent pas la compatibilité avec une version future.

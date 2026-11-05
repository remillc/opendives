#!/bin/bash
# OpenDives — aller-retour sur un vrai carnet du cloud Subsurface, en LECTURE SEULE.
#
#   0. sonde : la branche du carnet existe (sinon arrêt) ; on note sa tête
#   1. chargement par le cœur : clone (ou mise à jour) du cache local
#   2. copie du cache -> A, SANS distant « origin » : rien ne peut être poussé
#   3. A -> B (dépôt neuf)       écarts listés : A a été écrit par Subsurface
#   4. B -> C (dépôt neuf)       arbre identique                        [strict]
#   5. B -> B (réenregistrement) arbre inchangé                         [strict]
#   6. B -> b.xml, C -> c.xml    fichiers identiques                    [strict]
#   7. sonde : la tête de la branche du serveur n'a pas changé          [strict]
#
# Les identifiants sont lus dans <fichier-env> (OPENDIVES_CLOUD_EMAIL,
# OPENDIVES_CLOUD_PASSWORD) ; le mot de passe n'est jamais affiché.
# usage: run-cloud-readonly.sh <cloud> <roundtrip> <fichier-env> <dossier>
set -euo pipefail
CLOUD=$(realpath "$1"); RT=$(realpath "$2"); ENVF=$3; W=$4
set -a; source <(tr -d '\r' < "$ENVF"); set +a
BR=$OPENDIVES_CLOUD_EMAIL
rm -rf "$W"; mkdir -p "$W/home"; W=$(realpath "$W")
export HOME=$W/home   # cache du cœur : $HOME/.subsurface/cloudstorage/...
tree() { git -C "$1" rev-parse "refs/heads/$BR^{tree}"; }
newrepo() { rm -rf "$1"; git init -q -b "$BR" "$1"; }
fail() { echo "ÉCHEC : $*"; exit 1; }

"$CLOUD" probe | tee "$W/probe1" | grep -v '^head'
HEAD1=$(sed -n 's/^head: //p' "$W/probe1")
grep -q '^branche: présente' "$W/probe1" || fail "branche absente sur le serveur"

"$CLOUD" load > "$W/load" 2> "$W/load.log" || { cat "$W/load.log"; fail "chargement"; }
grep -E '^(chargé|git_local_only)' "$W/load"
CACHE=$(sed -n 's/^cache: //p' "$W/load")
[ "$(git -C "$CACHE" rev-parse "refs/heads/$BR")" = "$HEAD1" ] || fail "le cache ne correspond pas à la tête du serveur"
echo "cache = tête du serveur (${HEAD1:0:7}), $(git -C "$CACHE" rev-list --count "refs/heads/$BR") commits"
git -C "$CACHE" log -1 --format='dernier commit : %an | %s' "refs/heads/$BR"

cp -r "$CACHE" "$W/A"
git -C "$W/A" remote remove origin
git -C "$W/A" remote | grep -q . && fail "la copie a encore un distant"
newrepo "$W/B"; newrepo "$W/C"

"$RT" "$W/A[$BR]" "$W/B[$BR]" 2> "$W/log-AB" || fail "A -> B"
grep '^loaded' "$W/log-AB"
if [ "$(tree "$W/A")" = "$(tree "$W/B")" ]; then
  echo "A = B : arbre réécrit identique à celui de Subsurface"
else
  : > "$W/diffAB"
  for p in $( (git -C "$W/A" ls-tree -r --name-only "$BR"; git -C "$W/B" ls-tree -r --name-only "$BR") | sort -u); do
    d=$(diff <(git -C "$W/A" show "$BR:$p" 2>/dev/null) <(git -C "$W/B" show "$BR:$p" 2>/dev/null) | grep '^[<>]' || true)
    [ -n "$d" ] && printf '== %s\n%s\n' "$p" "$d" >> "$W/diffAB"
  done
  echo "A ≠ B : $(grep -c '^== ' "$W/diffAB") fichier(s) différent(s) ; mots-clés :" \
    $(grep '^[<>]' "$W/diffAB" | cut -c3- | cut -d' ' -f1 | sort | uniq -c | sort -rn | head -12 | awk '{print $2"("$1")"}')
  echo "détail : $W/diffAB"
fi

BAD=""
bad() { BAD="$BAD; $*"; echo "écart : $*"; }
"$RT" "$W/B[$BR]" "$W/C[$BR]" 2> "$W/log-BC" || fail "B -> C"
if [ "$(tree "$W/B")" != "$(tree "$W/C")" ]; then
  git -C "$W/B" fetch -q "$W/C" "refs/heads/$BR:refs/heads/c-copy"
  bad "arbre B ≠ arbre C ($(git -C "$W/B" diff --name-only "refs/heads/$BR" c-copy | wc -l) fichier(s), voir git -C $W/B diff $BR c-copy)"
fi
TB=$(tree "$W/B")
"$RT" "$W/B[$BR]" "$W/B[$BR]" 2> "$W/log-BB" || fail "B -> B"
[ "$TB" = "$(tree "$W/B")" ] || bad "arbre modifié au réenregistrement"
"$RT" "$W/B[$BR]" "$W/b.xml" 2> "$W/log-bx" && "$RT" "$W/C[$BR]" "$W/c.xml" 2> "$W/log-cx" || fail "export XML"
cmp -s "$W/b.xml" "$W/c.xml" || bad "b.xml ≠ c.xml ($(diff "$W/b.xml" "$W/c.xml" | grep -c '^[<>]') ligne(s))"

"$CLOUD" probe > "$W/probe2"
HEAD2=$(sed -n 's/^head: //p' "$W/probe2")
[ "$HEAD1" = "$HEAD2" ] || fail "la tête de la branche du serveur a changé : ${HEAD1:0:7} -> ${HEAD2:0:7}"
echo "serveur inchangé (${HEAD2:0:7})"
[ -z "$BAD" ] && echo "RÉUSSI" || { echo "ÉCARTS STRICTS :${BAD#;}"; exit 1; }

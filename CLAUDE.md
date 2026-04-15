# Instructions pour Claude — call-cc

## Rester à jour

- Nous sommes en **2026**. Toujours utiliser les versions et pratiques actuelles.
- En cas de doute sur une version, une API, ou une best practice, **faire une recherche web avant de répondre ou d'implémenter**. Ne pas se fier uniquement aux connaissances internes qui peuvent être outdatées.
- Si une information n'est pas certaine, **demander plutôt qu'assumer**.

## Contexte du projet

Voir `docs/ARCHITECTURE.md` pour toutes les décisions d'architecture.

## Règles générales

- Langue de communication : **français**
- Ne pas modifier l'architecture sans en discuter d'abord
- Toujours respecter l'architecture hexagonale (ports & adapters)
- Les providers (STT, TTS, LLM) doivent rester swappables — ne jamais coupler le domaine à un provider

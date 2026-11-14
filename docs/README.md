# Design documents

OpenDives' design documents, in English. The three analysis documents (Subsurface analysis, reverse engineering, architecture) are copies of French originals on claude.ai, whose diagrams are only visible online. Since 10 November 2026, the UI documents (System design, UI foundations, UI specification) are maintained here only: these files are the reference, and their old French versions on claude.ai are abandoned.

| Document | Content | Original (French) |
| --- | --- | --- |
| [Analysis of the Subsurface project](subsurface-analysis.md) | Code, formats, cloud, dive computers, current mobile app, CORS test | [online](https://claude.ai/artifact/PVHar8ng8ax2Cibm3JkAwN) |
| [Functional reverse engineering](reverse-engineering.md) | Subsurface's features, their relevance on mobile, new mobile features, decisions | [online](https://claude.ai/artifact/JoAhr3WfF5DVPiJabCuE2D) |
| [Proposed architecture](architecture.md) | Layers, native plugin, synchronisation, coexistence with Subsurface-mobile | [online](https://claude.ai/artifact/Q3xMEsTfLkAqTnwT4m33Z9) |
| [System design](system-design.md) | The rules every screen shares: principles, CSS naming, colours, visual identity, type, layout, shared components, states and messages | — |
| [UI foundations](ui-foundations.md) | Divers and usage situations, app organisation, key screens | — |
| [UI specification](ui-specification.md) | Each screen and the data it asks of the core: with the System design, the reference for the code | — |
| [Editing and cloud sync plan](editing-and-sync-plan.md) | First write path: facade API, write lock, tests on a test account | — |
| [Analytics decision](analytics-decision.md) | To-do #1 on pause: store statistics for now, what was established if it comes back | — |
| [Monetisation and the relationship with Subsurface](monetization.md) | GPLv2 constraints, revenue models, decision of 14 November 2026, draft message to the Subsurface maintainers | — |
| Key screen mock-ups | iPhone, Android, iOS and Android tablets | [online](https://claude.ai/artifact/Jpuj8pGER3xz8n383JvYep) |
| [Proof of concept](../poc/README.md) | Subsurface core without Qt, Git round trip | — |

When one of the three analysis documents changes on claude.ai, its copy here must be updated in English. The decisions that matter for the code are summarised in [AGENTS.md](../AGENTS.md).

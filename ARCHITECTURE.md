# Wendy Reception — Architecture Document

## Part 1: Existing System (As-Is)

### Overview

The `wendy-reception` repository is a **Next.js 14 application** with a modular Wendy platform under `src/wendy/`, static sales/demo HTML under `public/src/`, and Vercel deployment (project name `dr-fort-vercel` in `vercel.json`; package name `wendy-reception`). The live demo is at [dr-fort-vercel.vercel.app](https://dr-fort-vercel.vercel.app).

### Current Inventory

| Component | Status |
|---|---|
| **Frontend** | Next.js 14.2 App Router, React 18.3, TypeScript 5.0; landing page links to demo surfaces |
| **Demo surfaces** | `public/src/` — hub, deck, interactive prototype, live voice demo (static HTML) |
| **API routes** | `/api/chat` (Wendy runtime with mock backends), `/api/health` (service health) |
| **Agent architecture** | Receptionist, Scheduling, and Knowledge agents with orchestrator and registry |
| **Tool system** | Calendar, communication, knowledge, and handoff tools (interfaces + mock implementations in chat route) |
| **Model gateway** | Switchyard router, fallback logic, providers for Ollama, OpenAI, Anthropic, Gemini, Switchyard |
| **Privacy / policy** | PHI classifier, anonymizer, routing policy, safety engine |
| **Edge runtime** | Connector, health monitor, offline queue (library code; not deployed to hardware in-repo) |
| **Configuration** | YAML: `config/routing.yaml`, `config/agents.yaml`, `config/offices/example.yaml` |
| **Database** | None |
| **Authentication** | Tenant context extraction from request headers (no user auth UI) |
| **Voice provider** | Vapi integration in `public/src/live.html` demo only; no `/api/voice` route |
| **Calendar integration** | Mock calendar backend in chat route; no live Google Calendar / ChiroTouch connection |
| **Tests** | Vitest — `tests/agents.test.ts`, `tests/routing.test.ts`, synthetic patient fixtures |
| **Docker** | `docker-compose.yml` (Wendy edge + Ollama), `docker/edge.Dockerfile`, `docker/central.Dockerfile` |
| **Deployment** | Vercel (`vercel.json`); static demos served at `/src/*` |

### Key Directories

- `app/` — Next.js App Router: landing page, `/api/chat`, `/api/health`
- `src/wendy/` — Core platform modules:
  - `agents/` — agent interface, registry, orchestrator, receptionist, scheduling, knowledge
  - `tools/` — typed tool interfaces (calendar, communication, knowledge, handoff)
  - `models/` — model gateway, Switchyard router, provider adapters, fallback
  - `privacy/` — PHI/PII classification, anonymizer, privacy policy
  - `policy/` — routing policy and safety boundaries
  - `tenant/` — tenant context extraction and access guard
  - `runtime/` — Wendy execution runtime and agent context
  - `edge/` — edge-to-central connector, health, offline queue
  - `config/` — YAML config loader and schema validation
  - `audit/`, `observability/` — audit logger and metrics stubs
- `public/src/` — Static demo HTML: `hub.html`, `deck.html`, `index.html` (prototype), `live.html`, plus `deck.pdf`
- `config/` — Runtime YAML configuration
- `tests/` — Vitest unit tests
- `docker/` — Container images for edge and central deployments

### What Is Not Yet Built

- `/api/voice` and `/api/sms` webhook endpoints (listed in Part 3 target structure only)
- Production calendar, SMS, email, or EHR integrations (chat route uses mock backends)
- Database persistence or patient records
- End-user authentication / admin UI
- Jetson hardware deployment automation (Dockerfiles exist; no in-repo provisioning)
- NeMo Anonymizer wired to a live service (interface exists in `privacy/anonymizer.ts`)

### Conclusion

The repository has moved beyond a skeleton: the agent runtime, model routing abstractions, privacy/policy layers, and demo surfaces are in place. Production integrations (voice telephony, real calendars, persistent storage, edge hardware rollout) remain to be connected. Part 2 describes the target end-state architecture; Parts 3–4 track structure and implementation phases.

---

## Part 2: Target Architecture

### Design Principle

**Wendy's agents should never care where the model runs.**

```
Agent → Agent Runtime → Policy → Switchyard → Model
```

The agent requests a *capability* (e.g. `simple_conversation`, `appointment_scheduling`). The policy layer decides what data may be used. Switchyard decides where the request goes. The model runtime executes it.

### Five Logical Layers

1. **Client Channels** — Phone, SMS, Web, Chat
2. **Agent Gateway** — Wendy Reception entry point
3. **Safety/Data Layer** — PHI/PII detection, NeMo Anonymizer, Policy Engine, Tenant Isolation
4. **Switchyard Router** — Model routing based on task type, complexity, privacy, latency, cost
5. **Model Tiers** — Edge (Jetson), Central (GPU server), External (cloud, anonymized)

### Model Tiers

| Tier | Location | Use Case | Config Key |
|---|---|---|---|
| Tier 0 | Jetson Orin Nano Super (edge) | Greetings, FAQs, simple scheduling, intent classification | `edge_fast` |
| Tier 1 | Central NVIDIA GPU server | Complex reasoning, multi-step tools, summarization, large context | `central_reasoning` |
| Tier 2 | External cloud (OpenAI, Anthropic, etc.) | Escalation only; requires anonymization + policy approval | `external_reasoning` |

### Trust Zones

- **Zone A (Edge)** — Highest trust. Patient conversation, local PHI, local model. Prefer keeping PHI here.
- **Zone B (Central)** — Private infrastructure. Centralized models, permitted PHI, agent orchestration.
- **Zone C (External)** — Lowest trust. NO RAW PHI. Anonymization + policy check required before routing.

### Privacy Pipeline

```
PHI/PII → NeMo Anonymizer → Sanitized request → External model
                                              ↓
External response → Safety validation → Reconstruction → Wendy
```

### Agent Architecture

Initial agents (Phase 1 release):
1. **Receptionist Agent** — greeting, intent detection, FAQ, basic scheduling, human handoff
2. **Scheduling Agent** — calendar check, book/reschedule/cancel, reminders
3. **Knowledge Agent** — office-specific info retrieval (hours, services, insurance, policies)

Future agents: Intake, Follow-Up, Office Manager

### Tool System

Agents interact with external systems through typed, authorized, tenant-scoped tools:
- `get_calendar_availability`, `create_appointment`, `reschedule_appointment`, `cancel_appointment`
- `send_sms`, `send_email`
- `get_office_hours`, `search_knowledge_base`
- `create_intake_record`, `lookup_patient`
- `create_followup`, `handoff_to_human`

### Tenant Isolation

Every request carries `tenant_id` + `office_id`. Every database query enforces tenant scoping. Cross-tenant access is rejected at the data layer, not by the LLM.

### Offline Mode

When central server or internet is unavailable:
- Switchyard detects failure → routes to local edge model
- Basic receptionist functions continue (FAQs, hours, message collection, local scheduling)
- Non-critical events queued for sync when connectivity returns

### Networking

- **Tailscale** for edge-to-central private network (no inbound public ports)
- Device authentication, per-office ACLs, revocation capability
- Cloudflare Tunnel for public-facing dashboards only (not internal inference)

### Package Architecture (Future Modules)

```
Wendy Reception
├── Core Receptionist (shipped first)
├── Scheduling (shipped first)
├── Patient Intake
├── Follow-Up
├── Reviews
├── Missed Call Recovery
├── Office Manager
├── Analytics
└── Marketing
```

Each module adds agents, tools, workflows, permissions, prompts, routing policies, and integrations. The agent runtime stays the same.

---

## Part 3: Project Structure

```
wendy-reception/
├── app/                          # Next.js App Router (existing)
│   ├── api/
│   │   ├── chat/route.ts         # Web chat endpoint
│   │   ├── voice/route.ts        # Voice webhook endpoint
│   │   ├── sms/route.ts          # SMS webhook endpoint
│   │   └── health/route.ts       # Health check
│   ├── layout.tsx
│   └── page.tsx
├── src/
│   ├── wendy/
│   │   ├── agents/               # Agent interface + implementations
│   │   │   ├── base.ts           # Agent interface
│   │   │   ├── registry.ts       # Agent registry
│   │   │   ├── orchestrator.ts   # Intent → agent selection
│   │   │   ├── receptionist.ts   # Receptionist Agent
│   │   │   ├── scheduling.ts     # Scheduling Agent
│   │   │   └── knowledge.ts      # Knowledge Agent
│   │   ├── tools/                # Typed tool interface + implementations
│   │   │   ├── base.ts           # Tool interface
│   │   │   ├── registry.ts       # Tool registry
│   │   │   ├── calendar.ts       # Calendar tools
│   │   │   ├── communication.ts  # SMS/email tools
│   │   │   ├── knowledge.ts      # Knowledge base tools
│   │   │   └── handoff.ts        # Human handoff tool
│   │   ├── models/               # Model gateway + providers
│   │   │   ├── gateway.ts        # ModelGateway interface
│   │   │   ├── request.ts        # ModelRequest/ModelResponse types
│   │   │   ├── switchyard.ts     # Switchyard router
│   │   │   ├── providers/
│   │   │   │   ├── ollama.ts     # Local Ollama provider
│   │   │   │   ├── openai.ts     # OpenAI-compatible provider
│   │   │   │   └── nvidia.ts     # NVIDIA NIM provider
│   │   │   └── fallback.ts       # Fallback logic
│   │   ├── privacy/              # Privacy + PHI protection
│   │   │   ├── anonymizer.ts     # NeMo Anonymizer integration
│   │   │   ├── policy.ts         # Routing policy engine
│   │   │   └── classifier.ts     # PHI/PII classification
│   │   ├── policy/               # Policy engine
│   │   │   ├── routing.ts        # RoutingPolicy
│   │   │   └── safety.ts         # Safety boundaries
│   │   ├── tenant/               # Multi-tenant isolation
│   │   │   ├── context.ts        # Tenant context
│   │   │   └── guard.ts          # Tenant access guard
│   │   ├── audit/                # Audit logging
│   │   │   └── logger.ts         # Audit event system
│   │   ├── observability/        # Metrics + monitoring
│   │   │   └── metrics.ts        # Routing/agent/model metrics
│   │   ├── config/               # Configuration
│   │   │   ├── loader.ts         # Config loader
│   │   │   └── schema.ts         # Config schema/validation
│   │   ├── runtime/              # Agent runtime
│   │   │   ├── runtime.ts        # Agent execution runtime
│   │   │   └── context.ts        # AgentContext
│   │   ├── edge/                 # Edge runtime (Jetson)
│   │   │   ├── connector.ts      # Central server connector
│   │   │   ├── health.ts         # Health monitor
│   │   │   └── offline.ts        # Offline mode handler
│   │   └── types/                # Shared types
│   │       └── index.ts
├── config/
│   ├── routing.yaml              # Model routing config
│   ├── agents.yaml               # Agent configuration
│   └── offices/                  # Per-office configuration
│       └── example.yaml
├── tests/
│   ├── routing.test.ts
│   ├── privacy.test.ts
│   ├── tenant.test.ts
│   ├── agents.test.ts
│   ├── tools.test.ts
│   └── fixtures/
│       └── synthetic-patients.ts
├── .env.example
├── docker/
│   ├── edge.Dockerfile           # Jetson edge image
│   └── central.Dockerfile        # Central server image
├── docker-compose.yml            # Dev environment
├── package.json
└── ARCHITECTURE.md               # This document
```

---

## Part 4: Implementation Phases

### Phase 1 — Repository Architecture ✅ (this document)
- Inspect existing repo ✅
- Document current architecture ✅
- Identify integration points ✅
- Establish model gateway abstraction (next)

### Phase 2 — Agent Abstraction
- Agent interface, registry, orchestrator
- Tool interface + calendar/communication/knowledge tools
- Receptionist Agent + Scheduling Agent

### Phase 3 — Model Gateway
- Model abstraction, local/central providers
- Switchyard integration, fallback logic

### Phase 4 — Privacy
- NeMo Anonymizer integration
- Privacy policy engine, PHI/PII classification
- External-provider guardrails

### Phase 5 — Edge Runtime
- Jetson deployment, local model runtime
- Central connection, offline fallback

### Phase 6 — Security
- Authentication, tenant isolation, device identity
- Authorization, audit events, secret management

### Phase 7 — Observability
- Routing/model/agent metrics, device health, error tracking

### Phase 8 — Production Hardening
- Automated tests, synthetic dataset, failure/security testing, deployment docs
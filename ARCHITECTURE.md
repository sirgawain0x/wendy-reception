# Wendy Reception — Architecture Document

## Part 1: Existing System (As-Is)

### Overview

The `wendy-reception` repository is a **greenfield Next.js 14 skeleton** with no business logic. It was scaffolded for Vercel deployment under the working name `dr-fort-vercel`.

### Current Inventory

| Component | Status |
|---|---|
| **Frontend** | Next.js 14.2.0 App Router, React 18.3, TypeScript 5.0 |
| **Backend** | Empty `app/api/` directory — no API routes |
| **Database** | None |
| **Authentication** | None |
| **Voice provider** | None |
| **Calendar integration** | None |
| **AI/LLM integration** | None |
| **Agent/tool architecture** | None |
| **Tests** | None |
| **Docker** | None |
| **Deployment** | Vercel project `wendy-reception` (linked) |

### Files

- `app/page.tsx` — placeholder landing page listing static HTML files
- `app/layout.tsx` — root layout, metadata titled "Dr Fort Vercel"
- `src/*.html` — 4 static Vercel dashboard page exports (~472KB each), not application code
- `public/src/*.html` — identical 4KB placeholder copies
- `vercel.json` — Next.js framework config with rewrite rules for `/src/*`
- `package.json` — name `dr-fort-vercel`, only Next.js/React deps
- `.env.local` — Vercel OIDC token only

### Conclusion

There is no existing receptionist booking flow or business logic to preserve. The architecture will be built on the existing Next.js App Router foundation. All abstractions (models, providers, agents, tools, conversations) will be created fresh in a clean, modular structure.

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
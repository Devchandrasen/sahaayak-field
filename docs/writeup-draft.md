# Sahaayak Field

## Offline disaster triage with Gemma 4 for volunteers working beyond reliable connectivity

**Track:** Global Resilience  
**Special technology target:** Ollama local runtime, with a LiteRT/llama.cpp edge path

When disasters hit, the first useful information often comes from people who are closest to the scene and furthest from stable infrastructure. A volunteer may have a phone, a damaged road in front of them, one blurry photo, weak signal, and no time to write a clean report. Sahaayak Field turns that messy field evidence into a structured, auditable triage packet that a local command center can act on.

The prototype demonstrates a low-connectivity workflow for trained volunteers. The user submits a scene image, a short field report, a location hint, preferred language, and connectivity state. Gemma 4 analyzes the evidence and returns a JSON packet containing incident type, severity, observed facts, inferred risks, immediate actions, resource needs, escalation status, missing information, a radio-length message, and audit notes. The browser app stores packets in an offline queue so the volunteer can continue working until connectivity returns.

## Architecture

The app has three layers. The browser layer provides incident intake, image preview, triage display, structured JSON output, and offline packet storage through localStorage. The Node layer serves the app and exposes `/api/analyze`. The model layer calls Gemma 4 through an Ollama-compatible local chat endpoint. The model name and endpoint are configurable with `GEMMA_MODEL` and `OLLAMA_URL`, allowing the same interface to run against different Gemma 4 variants and local runtimes.

For development safety, the repository includes an explicit deterministic fallback when Ollama is unavailable. This fallback is labeled in the UI and exists only to keep the demo operable on machines where Gemma 4 has not been installed. The final submission run uses the real Gemma 4 adapter, visible in the status bar and verified by server logs.

## How Gemma 4 Is Used

Gemma 4 is not used as a generic chatbot. It is the structured reasoning core of the field workflow. The system prompt instructs the model to behave as a disaster response assistant for trained volunteers, separate observed facts from inferred risks, avoid unsupported claims, escalate dangerous cases, and return only valid JSON.

The user message contains the field report, location, language, connectivity state, and requested schema. If an image is attached, the adapter passes it as a base64 image payload to the local model endpoint. Gemma 4's multimodal understanding supports scene interpretation; its structured-output behavior supports reliable JSON packets; its local deployment profile supports privacy and low-connectivity work; and its multilingual capability supports volunteers who do not all operate in English.

This project intentionally wraps the model with product constraints. The UI shows evidence and audit notes instead of a single opaque answer. The output schema keeps the response machine-readable for later integration with maps, shelters, dispatch tools, and radio systems. The offline queue makes the product useful in exactly the condition it is designed for: weak or absent connectivity.

## Technical Choices

We chose a small, dependency-light web prototype because hackathon judging rewards a working product over a complex stack. Node's built-in HTTP server keeps setup simple, while the browser UI is fast enough to run on modest laptops. Ollama is used as the first local runtime target because it is easy for judges and developers to reproduce. The architecture leaves room for a mobile build using LiteRT or a resource-constrained build using llama.cpp.

The model output is constrained to a fixed schema so downstream systems can validate, store, transmit, and review each packet. The severity decision is not hidden: the app displays observed facts, inferred risks, and audit notes. This matters because emergency response workflows require trust, not just fluency.

## Challenges

The hardest design challenge was balancing speed with responsibility. A field assistant must be concise, but it must not overstate what it knows. The prompt therefore forces separation between evidence and inference and asks for missing information when the scene is unclear. Another challenge was demo reliability. Local model availability varies, so the repository includes a clearly labeled fallback while preserving the real Gemma 4 integration path.

## Impact

Sahaayak Field is a proof of concept for community-scale resilience. It can help volunteers produce better incident reports, reduce command-center ambiguity, and preserve an auditable record of early decisions. In future versions, the same architecture can ingest local standard operating procedures, shelter capacity lists, supply inventories, and offline maps. The goal is not to replace responders. The goal is to give them a faster, clearer, more trustworthy first packet when every minute matters.


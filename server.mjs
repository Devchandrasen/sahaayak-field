import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");
const systemPromptPath = path.join(__dirname, "prompts", "gemma-system.md");

const PORT = Number(process.env.PORT || 4173);
const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434/api/chat";
const GEMMA_MODEL = process.env.GEMMA_MODEL || "gemma4:e4b";
const FORCE_DEMO = process.env.USE_DEMO === "1";

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg"
};

const responseSchema = {
  incident_type: "flood | fire | structural | medical | road_block | unknown",
  severity: "low | medium | high | critical",
  confidence: "number between 0 and 1",
  observed_facts: ["facts grounded in the report or image"],
  inferred_risks: ["risks clearly marked as inference"],
  immediate_actions: ["ordered steps for the next 15 minutes"],
  resources_needed: ["people, supplies, tools, or vehicles"],
  escalation_required: "boolean",
  missing_information: ["questions for the volunteer"],
  radio_message: "SMS/radio length summary",
  audit_notes: ["why this triage was chosen"]
};

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(body);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks).toString("utf8");
  if (!body.trim()) return {};
  return JSON.parse(body);
}

function stripDataUrl(value = "") {
  const marker = ";base64,";
  const index = value.indexOf(marker);
  return index === -1 ? value : value.slice(index + marker.length);
}

function extractJson(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function keywordSeverity(text) {
  const lower = text.toLowerCase();
  if (/(trapped|collapse|unconscious|fire|electrical|gas leak|swept|missing|bleeding|landslide)/.test(lower)) {
    return "critical";
  }
  if (/(bridge|flood|injured|blocked|evacuate|crack|water rising|stranded)/.test(lower)) {
    return "high";
  }
  if (/(road|shelter|medicine|food|power|water)/.test(lower)) {
    return "medium";
  }
  return "low";
}

function demoAnalysis(input) {
  const report = String(input.report || "");
  const location = String(input.location || "unknown location");
  const lower = report.toLowerCase();
  const severity = keywordSeverity(report);
  const incidentType = lower.includes("fire")
    ? "fire"
    : lower.includes("bridge") || lower.includes("collapse")
      ? "structural"
      : lower.includes("flood") || lower.includes("water")
        ? "flood"
        : lower.includes("injured") || lower.includes("medical")
          ? "medical"
          : "unknown";

  return {
    incident_type: incidentType,
    severity,
    confidence: severity === "critical" ? 0.86 : 0.74,
    observed_facts: [
      `Field report references ${location}.`,
      report || "No free-text report was provided.",
      input.imageData ? "Volunteer attached an incident image for visual review." : "No incident image was attached."
    ],
    inferred_risks: [
      "Secondary injury risk if volunteers enter the area without command clearance.",
      incidentType === "flood" ? "Water level may continue rising and isolate households." : "Scene conditions may change before responders arrive."
    ],
    immediate_actions: [
      "Mark the area as unsafe and keep bystanders away.",
      "Send one volunteer to verify access route without entering the hazard zone.",
      "Report headcount, visible injuries, and blocked access to command.",
      "Prepare evacuation support for elderly, children, and people with mobility needs."
    ],
    resources_needed: [
      "2 trained responders",
      "first aid kit",
      "high-visibility tape",
      "portable lights",
      incidentType === "flood" ? "rope and flotation aid" : "structural assessment support"
    ],
    escalation_required: severity === "high" || severity === "critical",
    missing_information: [
      "Exact GPS coordinates",
      "Number of people exposed",
      "Whether power lines, gas, or fuel are present",
      "Nearest safe staging point"
    ],
    radio_message: `${severity.toUpperCase()} ${incidentType.toUpperCase()} at ${location}. Keep civilians clear, verify access route, request responders and first aid. Need GPS, headcount, hazards.`,
    audit_notes: [
      "Severity is based on hazard keywords, reported location, and attached media presence.",
      "Escalation is required when structural, medical, flood, fire, or blocked-access risk is present.",
      "This demo fallback is deterministic; production mode calls Gemma 4 through the Ollama adapter."
    ]
  };
}

async function callGemma(input) {
  const systemPrompt = await readFile(systemPromptPath, "utf8");
  const userPrompt = [
    "Create a disaster triage packet from this field input.",
    "",
    `Location: ${input.location || "unknown"}`,
    `Preferred language: ${input.language || "English"}`,
    `Connectivity: ${input.connectivity || "unknown"}`,
    `Field report: ${input.report || "none"}`,
    "",
    "Return only JSON matching this schema:",
    JSON.stringify(responseSchema, null, 2)
  ].join("\n");

  const userMessage = { role: "user", content: userPrompt };
  const image = stripDataUrl(input.imageData);
  if (image) userMessage.images = [image];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);

  try {
    const response = await fetch(OLLAMA_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: GEMMA_MODEL,
        stream: false,
        messages: [
          { role: "system", content: systemPrompt },
          userMessage
        ],
        options: {
          temperature: 0.2,
          top_p: 0.9
        }
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`Ollama returned ${response.status}`);
    }

    const payload = await response.json();
    const content = payload?.message?.content || payload?.response || "";
    const parsed = extractJson(content);
    if (!parsed) {
      throw new Error("Gemma response did not contain parseable JSON");
    }

    return {
      engine: "ollama",
      model: GEMMA_MODEL,
      analysis: parsed,
      raw: content
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function analyze(input) {
  if (FORCE_DEMO) {
    return {
      engine: "demo",
      model: "deterministic-fallback",
      analysis: demoAnalysis(input)
    };
  }

  try {
    return await callGemma(input);
  } catch (error) {
    return {
      engine: "demo",
      model: "deterministic-fallback",
      warning: error.message,
      analysis: demoAnalysis(input)
    };
  }
}

async function serveStatic(req, res) {
  const requestUrl = new URL(req.url, `http://${req.headers.host}`);
  const requested = requestUrl.pathname === "/" ? "/index.html" : decodeURIComponent(requestUrl.pathname);
  const filePath = path.normalize(path.join(publicDir, requested));

  if (!filePath.startsWith(publicDir) || !existsSync(filePath)) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }

  const body = await readFile(filePath);
  res.writeHead(200, {
    "content-type": mimeTypes[path.extname(filePath)] || "application/octet-stream",
    "cache-control": "no-store"
  });
  res.end(body);
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url?.startsWith("/api/health")) {
      sendJson(res, 200, {
        ok: true,
        model: GEMMA_MODEL,
        ollamaUrl: OLLAMA_URL,
        forcedDemo: FORCE_DEMO
      });
      return;
    }

    if (req.method === "POST" && req.url === "/api/analyze") {
      const input = await readBody(req);
      const result = await analyze(input);
      sendJson(res, 200, result);
      return;
    }

    if (req.method === "GET") {
      await serveStatic(req, res);
      return;
    }

    sendJson(res, 405, { error: "Method not allowed" });
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Unexpected server error" });
  }
});

server.listen(PORT, () => {
  console.log(`Sahaayak Field running at http://localhost:${PORT}`);
  console.log(`Gemma adapter: ${GEMMA_MODEL} via ${OLLAMA_URL}`);
});

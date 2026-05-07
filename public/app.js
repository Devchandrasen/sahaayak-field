const $ = (selector) => document.querySelector(selector);

const elements = {
  analyze: $("#analyze"),
  loadSample: $("#loadSample"),
  savePacket: $("#savePacket"),
  imageInput: $("#imageInput"),
  preview: $("#preview"),
  location: $("#location"),
  report: $("#report"),
  language: $("#language"),
  connectivity: $("#connectivity"),
  engineDot: $("#engineDot"),
  engineLabel: $("#engineLabel"),
  severity: $("#severity"),
  incidentType: $("#incidentType"),
  confidence: $("#confidence"),
  actions: $("#actions"),
  resources: $("#resources"),
  radio: $("#radio"),
  evidence: $("#evidence"),
  jsonOutput: $("#jsonOutput"),
  queueCount: $("#queueCount"),
  queueList: $("#queueList")
};

let imageData = "";
let latestPacket = null;

function setItems(container, items = []) {
  container.innerHTML = "";
  for (const item of items) {
    const li = document.createElement("li");
    li.textContent = item;
    container.appendChild(li);
  }
}

function normalizePercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  return `${Math.round(number * 100)}%`;
}

function renderPacket(result) {
  const packet = result.analysis || {};
  latestPacket = {
    generatedAt: new Date().toISOString(),
    engine: result.engine,
    model: result.model,
    ...packet
  };

  const severity = String(packet.severity || "unknown").toLowerCase();
  elements.severity.textContent = severity;
  elements.severity.className = `severity ${severity}`;
  elements.incidentType.textContent = packet.incident_type || "-";
  elements.confidence.textContent = normalizePercent(packet.confidence);
  setItems(elements.actions, packet.immediate_actions);
  setItems(elements.resources, packet.resources_needed);
  elements.radio.textContent = packet.radio_message || "-";
  setItems(elements.evidence, [
    ...(packet.observed_facts || []),
    ...(packet.inferred_risks || []).map((risk) => `Inference: ${risk}`),
    ...(packet.audit_notes || []).map((note) => `Audit: ${note}`)
  ]);
  elements.jsonOutput.textContent = JSON.stringify(latestPacket, null, 2);

  if (result.engine === "ollama") {
    elements.engineDot.className = "dot online";
    elements.engineLabel.textContent = `Gemma 4 via ${result.model}`;
  } else {
    elements.engineDot.className = "dot demo";
    elements.engineLabel.textContent = result.warning ? "Demo fallback active" : "Demo mode active";
  }
}

function readQueue() {
  try {
    return JSON.parse(localStorage.getItem("sahaayakQueue") || "[]");
  } catch {
    return [];
  }
}

function writeQueue(queue) {
  localStorage.setItem("sahaayakQueue", JSON.stringify(queue.slice(0, 12)));
  renderQueue();
}

function renderQueue() {
  const queue = readQueue();
  elements.queueCount.textContent = String(queue.length);
  elements.queueList.innerHTML = "";
  for (const item of queue) {
    const li = document.createElement("li");
    const time = new Date(item.generatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    li.textContent = `${time} · ${item.severity || "unknown"} · ${item.incident_type || "incident"}`;
    elements.queueList.appendChild(li);
  }
}

async function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function loadSampleImage() {
  const response = await fetch("/assets/sample-incident.svg");
  const blob = await response.blob();
  imageData = await fileToDataUrl(blob);
  elements.preview.src = imageData;
}

async function analyze() {
  elements.analyze.disabled = true;
  elements.analyze.textContent = "Analyzing";

  try {
    if (!imageData) await loadSampleImage();

    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        location: elements.location.value,
        report: elements.report.value,
        language: elements.language.value,
        connectivity: elements.connectivity.value,
        imageData
      })
    });

    if (!response.ok) throw new Error(`Analysis failed: ${response.status}`);
    renderPacket(await response.json());
  } catch (error) {
    elements.radio.textContent = error.message;
  } finally {
    elements.analyze.disabled = false;
    elements.analyze.textContent = "Analyze with Gemma 4";
  }
}

async function checkHealth() {
  try {
    const response = await fetch("/api/health");
    const health = await response.json();
    elements.engineDot.className = health.forcedDemo ? "dot demo" : "dot";
    elements.engineLabel.textContent = health.forcedDemo ? "Demo mode forced" : `Ready for ${health.model}`;
  } catch {
    elements.engineLabel.textContent = "Server unavailable";
  }
}

elements.imageInput.addEventListener("change", async (event) => {
  const [file] = event.target.files || [];
  if (!file) return;
  imageData = await fileToDataUrl(file);
  elements.preview.src = imageData;
});

elements.loadSample.addEventListener("click", async () => {
  elements.location.value = "Ward 7, low bridge near old market";
  elements.report.value = "Water is rising near the old bridge. Two families are stuck on the far side, one elderly person may need medicine, and the road is cracked near the middle span. Mobile data is weak.";
  await loadSampleImage();
});

elements.analyze.addEventListener("click", analyze);

elements.savePacket.addEventListener("click", () => {
  if (!latestPacket) return;
  writeQueue([latestPacket, ...readQueue()]);
});

checkHealth();
renderQueue();
loadSampleImage();

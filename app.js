import { idbGet, idbSet, idbClear } from "./idb.js";

/**
 * OPÇÃO 1:
 * /index.html?modules=animal_create,vaccine
 */

const $ = (sel) => document.querySelector(sel);

const state = {
    modules: [],
    activeKey: null,
    activeFormEl: null
};

function toast(msg) {
    const wrap = $("#toast");
    const el = document.createElement("div");
    el.textContent = msg;
    wrap.appendChild(el);
    setTimeout(() => el.remove(), 3200);
}

function setNetBadge() {
    const online = navigator.onLine;
    $("#netDot").classList.toggle("off", !online);
    $("#netLabel").textContent = online ? "online" : "offline";
}

function escapeHtml(s) {
    return String(s ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function uuid() {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (crypto.getRandomValues(new Uint8Array(1))[0] & 15) >> 0;
        const v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

function prettifyKey(k) {
    return String(k || "")
        .replaceAll("_", " ")
        .replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Catálogo fixo de módulos
 * (depois você expande com todos os módulos do seu app)
 */
const MODULE_CATALOG = {
    animal_create: {
        key: "animal_create",
        label: "Criar Animal",
        desc: "Cadastro offline de animal",
        storageKey: "animals",
        fields: [
            { key: "identification", label: "Brinco / Identificação", type: "text", required: true },
            {
                key: "sex", label: "Sexo", type: "select",
                options: [
                    { v: "", t: "Selecione…" },
                    { v: "M", t: "Macho" },
                    { v: "F", t: "Fêmea" }
                ]
            },
            { key: "birth_date", label: "Data de nascimento", type: "date" },
            { key: "notes", label: "Observações", type: "textarea" }
        ]
    },

    vaccine: {
        key: "vaccine",
        label: "Vacinação",
        desc: "Registro offline de vacinação",
        storageKey: "vaccinations",
        fields: [
            { key: "animal_identification", label: "Brinco do Animal", type: "text", required: true },
            { key: "vaccine_name", label: "Vacina", type: "text", required: true },
            { key: "date", label: "Data", type: "date", required: true },
            { key: "dose", label: "Dose", type: "text" },
            { key: "notes", label: "Observações", type: "textarea" }
        ]
    },

    // exemplo extra (pra você ver como adiciona)
    animal_edit: {
        key: "animal_edit",
        label: "Editar Animal",
        desc: "Exemplo de módulo (a lógica de edição você implementa depois)",
        storageKey: "animal_edits",
        fields: [
            { key: "identification", label: "Brinco (alvo)", type: "text", required: true },
            { key: "new_notes", label: "Nova observação", type: "textarea", required: true }
        ]
    }
};

async function getModules() {
    const u = new URL(location.href);
    const raw = (u.searchParams.get("modules") || "").trim();

    // Se veio pela URL, usa e salva como "último escolhido"
    if (raw) {
        const keys = raw.split(",").map(s => s.trim()).filter(Boolean);
        if (keys.length) {
            await idbSet("meta", "lastModules", keys);
            await idbSet("meta", "lastModulesUrl", location.pathname + location.search);
            return keys;
        }
    }

    // Se NÃO veio "modules=" (caso do ícone do PWA), tenta recuperar do IndexedDB
    const saved = await idbGet("meta", "lastModules");
    if (Array.isArray(saved) && saved.length) return saved;

    // fallback
    return ["animal_create"];
}


function buildModules(keys) {
    return keys.map((k) => {
        // se existir no catálogo, usa ele
        if (MODULE_CATALOG[k]) return MODULE_CATALOG[k];

        // se não existir, cria módulo genérico com um campo
        return {
            key: k,
            label: prettifyKey(k),
            desc: "Módulo genérico (não cadastrado no catálogo)",
            storageKey: k,
            fields: [{ key: "name", label: "Nome", type: "text", required: true }]
        };
    });
}

// ---------- Render UI ----------
function renderTabs() {
    const tabs = $("#tabs");
    tabs.innerHTML = "";

    for (const m of state.modules) {
        const el = document.createElement("div");
        el.className = "tab" + (state.activeKey === m.key ? " active" : "");
        el.textContent = m.label;
        el.onclick = async () => {
            state.activeKey = m.key;
            renderTabs();
            await renderModule();
        };
        tabs.appendChild(el);
    }
}

function buildField(field, draftValue) {
    const wrap = document.createElement("div");
    wrap.className = "field";

    const label = document.createElement("label");
    label.textContent = field.label || field.key;
    wrap.appendChild(label);

    const type = (field.type || "text").toLowerCase();
    let input;

    if (type === "textarea") {
        input = document.createElement("textarea");
        input.value = draftValue ?? (field.default ?? "");
    } else if (type === "select") {
        input = document.createElement("select");
        const opts = Array.isArray(field.options) ? field.options : [];
        for (const o of opts) {
            const opt = document.createElement("option");
            opt.value = String(o.v ?? "");
            opt.textContent = String(o.t ?? o.v ?? "");
            input.appendChild(opt);
        }
        input.value = String(draftValue ?? field.default ?? "");
    } else {
        input = document.createElement("input");
        input.type = ["text", "number", "date", "time", "email"].includes(type) ? type : "text";
        input.value = String(draftValue ?? field.default ?? "");
    }

    input.dataset.key = field.key;
    input.dataset.required = field.required ? "1" : "0";

    if (field.fullWidth) input.style.gridColumn = "1 / -1";

    wrap.appendChild(input);
    return wrap;
}

function readForm(formEl) {
    const data = {};
    const inputs = formEl.querySelectorAll("input,select,textarea");
    inputs.forEach((el) => {
        const k = el.dataset.key;
        data[k] = (el.value ?? "").toString();
    });
    return data;
}

function validateForm(formEl) {
    const inputs = formEl.querySelectorAll("input,select,textarea");
    for (const el of inputs) {
        const req = el.dataset.required === "1";
        const v = (el.value ?? "").toString().trim();
        if (req && !v) {
            return { ok: false, key: el.dataset.key };
        }
    }
    return { ok: true };
}

async function renderModule() {
    const m = state.modules.find(x => x.key === state.activeKey) || state.modules[0];
    if (!m) return;

    $("#viewTitle").textContent = m.label;
    $("#viewDesc").textContent = m.desc || "—";

    const view = $("#view");
    view.innerHTML = "";

    // draft por módulo
    const draftKey = `draft:${m.key}`;
    const draft = (await idbGet("drafts", draftKey)) || {};

    const form = document.createElement("div");
    form.className = "form";

    for (const field of m.fields) {
        const dv = draft[field.key];
        form.appendChild(buildField(field, dv));
    }

    // auto-save draft
    form.addEventListener("input", async () => {
        const data = readForm(form);
        await idbSet("drafts", draftKey, data);
    });

    view.appendChild(form);
    state.activeFormEl = form;

    await renderLocalListFor(m);
}

async function renderLocalListFor(m) {
    const listEl = $("#localList");
    listEl.innerHTML = "";

    const storageKey = m.storageKey || m.key;
    const records = (await idbGet("records", storageKey)) || [];

    $("#localCount").textContent = String(records.length);

    if (!records.length) {
        const empty = document.createElement("div");
        empty.className = "muted";
        empty.textContent = "Sem registros locais ainda.";
        listEl.appendChild(empty);
        return;
    }

    for (const r of records.slice(0, 20)) {
        const box = document.createElement("div");
        box.className = "item";

        const title =
            r.identification ||
            r.name ||
            r.vaccine_name ||
            r.animal_identification ||
            r._localId ||
            "(registro)";

        box.innerHTML = `
      <div><b>${escapeHtml(title)}</b></div>
      <div class="small">${escapeHtml(new Date(r._createdAt).toLocaleString())}</div>
    `;
        listEl.appendChild(box);
    }
}

// ---------- Ações ----------
async function saveOffline() {
    const m = state.modules.find(x => x.key === state.activeKey);
    if (!m || !state.activeFormEl) return;

    const val = validateForm(state.activeFormEl);
    if (!val.ok) {
        toast(`Campo obrigatório: ${val.key}`);
        return;
    }

    const data = readForm(state.activeFormEl);

    const record = {
        _localId: uuid(),
        _module: m.key,
        _createdAt: Date.now(),
        ...data
    };

    const storageKey = m.storageKey || m.key;
    const curr = (await idbGet("records", storageKey)) || [];
    curr.unshift(record);
    await idbSet("records", storageKey, curr);

    // limpa draft e re-render
    await idbSet("drafts", `draft:${m.key}`, {});
    toast("Salvo offline.");
    await renderModule();
}


// ---------- PWA ----------
async function registerSW() {
    if (!("serviceWorker" in navigator)) return;
    try {
        await navigator.serviceWorker.register("./sw.js");
    } catch { }
}


async function swStatusDebug() {
    const el = document.getElementById("subTitle");
    if (!("serviceWorker" in navigator)) {
        el.textContent = "Service Worker: NÃO suportado";
        return;
    }

    try {
        const reg = await navigator.serviceWorker.getRegistration();
        if (!reg) {
            el.textContent = "Service Worker: NÃO registrado";
            return;
        }

        // ready = instalado e ativo
        await navigator.serviceWorker.ready;
        el.textContent = "Service Worker: ATIVO ✅ (offline pronto)";
    } catch (e) {
        el.textContent = "Service Worker: erro ao registrar ❌";
    }
}

// ---------- init ----------
async function init() {
    setNetBadge();
    window.addEventListener("online", () => { setNetBadge(); toast("Você está online."); });
    window.addEventListener("offline", () => { setNetBadge(); toast("Você ficou offline."); });

    const keys = await getModules();
    state.modules = buildModules(keys);
    state.activeKey = state.modules[0]?.key || null;

    await idbSet("meta", "lastModules", keys);

    $("#appTitle").textContent = "Offline Bovichain PWA - Teste";
    $("#subTitle").textContent = "UI montada por URL + IndexedDB (sem sync)";
    $("#cfgInfo").innerHTML = `
    <div class="muted">
      <b>modules</b>: ${escapeHtml(keys.join(", "))}<br/>
      <span style="opacity:.85">Adicione módulos no <b>MODULE_CATALOG</b> para definir campos.</span>
    </div>
  `;

    $("#btnSave").onclick = saveOffline;

    await registerSW();
    swStatusDebug();
    renderTabs();
    await renderModule();
}



init();

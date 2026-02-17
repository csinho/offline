export function openDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open("offline_builder_db", 1);

        req.onupgradeneeded = () => {
            const db = req.result;

            // Guarda a config atual aplicada (pra debug/recuperação)
            if (!db.objectStoreNames.contains("meta")) {
                db.createObjectStore("meta");
            }

            // Registros offline por módulo: key = storageKey (ex: "animals")
            // value = array de registros
            if (!db.objectStoreNames.contains("records")) {
                db.createObjectStore("records");
            }

            // Rascunho (draft) do formulário por módulo
            if (!db.objectStoreNames.contains("drafts")) {
                db.createObjectStore("drafts");
            }
        };

        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

function store(db, name, mode = "readonly") {
    return db.transaction(name, mode).objectStore(name);
}

export async function idbGet(storeName, key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const req = store(db, storeName).get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

export async function idbSet(storeName, key, value) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const req = store(db, storeName, "readwrite").put(value, key);
        req.onsuccess = () => resolve(true);
        req.onerror = () => reject(req.error);
    });
}

export async function idbClear(storeName) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const req = store(db, storeName, "readwrite").clear();
        req.onsuccess = () => resolve(true);
        req.onerror = () => reject(req.error);
    });
}

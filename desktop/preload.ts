import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("moerlin", {
  getBackendUrl: async () => ipcRenderer.invoke("get-backend-url")
});

contextBridge.exposeInMainWorld("moerlinPrinciples", {
  getPrinciples: async () => {
    const res = await ipcRenderer.invoke("get-principles");
    return res;
  }
});

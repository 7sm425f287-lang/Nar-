import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("niro", {
  getBackendUrl: async () => ipcRenderer.invoke("get-backend-url")
});

contextBridge.exposeInMainWorld("niroPrinciples", {
  getPrinciples: async () => {
    const res = await ipcRenderer.invoke("get-principles");
    return res;
  }
});

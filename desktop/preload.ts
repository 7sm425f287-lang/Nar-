import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("niro", {
  getBackendUrl: async () => ipcRenderer.invoke("get-backend-url")
});

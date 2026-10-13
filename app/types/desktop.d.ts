export interface PhotixDesktop {
  getExportDirectory(): Promise<string>
  chooseExportDirectory(): Promise<string | null>
  resetExportDirectory(): Promise<string>
  openExportDirectory(): Promise<void>
  saveFile(file: { name: string; bytes: Uint8Array }): Promise<string>
}

declare global {
  interface Window {
    photixDesktop?: PhotixDesktop
  }
}

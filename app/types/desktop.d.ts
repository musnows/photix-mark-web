export interface SavedSignatureFile {
  name: string
  bytes: Uint8Array
}

export interface YingqianDesktop {
  getExportDirectory(): Promise<string>
  chooseExportDirectory(): Promise<string | null>
  resetExportDirectory(): Promise<string>
  openExportDirectory(): Promise<void>
  saveFile(file: { name: string; bytes: Uint8Array }): Promise<string>
  getSavedSignature(): Promise<SavedSignatureFile | null>
  saveSignature(file: SavedSignatureFile): Promise<void>
  clearSavedSignature(): Promise<void>
}

declare global {
  interface Window {
    yingqianDesktop?: YingqianDesktop
  }
}

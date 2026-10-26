App({
  globalData: { photos: [], nextPhotoId: 1, templateId: 'standard1' },
  onLaunch() {
    const saved = wx.getStorageSync('photix-preferences-v1')
    if (saved && typeof saved === 'object') this.globalData.preferences = saved
    const signature = wx.getStorageSync('photix-signature-v1')
    if (signature && typeof signature.dataUrl === 'string' && signature.dataUrl.startsWith(`${wx.env.USER_DATA_PATH}/photix-signature-`)) {
      try {
        wx.getFileSystemManager().accessSync(signature.dataUrl)
        this.globalData.signature = signature
      } catch { this.globalData.signature = undefined }
    }
  }
})

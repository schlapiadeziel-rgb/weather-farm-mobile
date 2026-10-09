import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core'

export type AiState = 'unsupported' | 'missing' | 'downloading' | 'downloaded' | 'loading' | 'ready' | 'generating' | 'error'

export interface ModelProfile {
  id: string
  name: string
  downloadBytes: number
  recommendedMemoryBytes: number
  sourceUrl: string
  license: string
  type: 'vision-language'
  description: string
  downloaded: boolean
  selected: boolean
}

export interface ModelStatus {
  state: AiState
  modelId: string
  modelName: string
  modelPresent: boolean
  projectorPresent: boolean
  downloadedBytes: number
  totalBytes: number
  progress: number
  totalMemoryBytes: number
  availableMemoryBytes: number
  freeStorageBytes: number
  recommendedMemoryBytes: number
  canLoad: boolean
  loaded: boolean
  visionSupported: boolean
  speechSupported: boolean
  engineVersion: string
  error?: string
}

export interface AiMedia {
  id: string
  kind: 'photo' | 'video-frame'
  uri: string
  previewDataUrl: string
  width: number
  height: number
  timestampSeconds?: number
}

export interface SelectedAiMedia {
  media: AiMedia[]
  videoDurationSeconds?: number
}

export interface AiGenerateOptions {
  system: string
  user: string
  mediaIds?: string[]
  maxTokens?: number
}

export interface AiGenerateResult {
  text: string
  stopped: boolean
  tokens: number
  durationMs: number
  modelId: string
}

export interface AiEvents {
  aiState: ModelStatus
  aiProgress: { part: 'model' | 'projector'; downloadedBytes: number; totalBytes: number; progress: number }
  aiToken: { text: string; tokenCount: number }
}

export interface LocalAiPlugin {
  listModels(): Promise<{ models: ModelProfile[] }>
  selectModel(options: { modelId: string }): Promise<ModelStatus>
  getStatus(): Promise<ModelStatus>
  downloadModels(): Promise<ModelStatus>
  cancelDownload(): Promise<void>
  importModel(options: { part: 'model' | 'projector' }): Promise<ModelStatus>
  loadModel(): Promise<ModelStatus>
  unloadModel(): Promise<ModelStatus>
  selectImage(options: { source: 'camera' | 'gallery' }): Promise<SelectedAiMedia>
  selectVideo(options?: { source: 'camera' | 'gallery' }): Promise<SelectedAiMedia>
  clearMedia(): Promise<void>
  transcribeSpeech(): Promise<{ text: string }>
  stopSpeech(): Promise<void>
  generate(options: AiGenerateOptions): Promise<AiGenerateResult>
  stopGeneration(): Promise<void>
  addListener<K extends keyof AiEvents>(eventName: K, callback: (event: AiEvents[K]) => void): Promise<PluginListenerHandle>
}

const nativePlugin = registerPlugin<LocalAiPlugin>('LocalAi')
export const isNativeLocalAiAvailable = () => Capacitor.getPlatform() === 'android'

const unavailable = () => Promise.reject(new Error('浏览器预览没有本机 AI 引擎，请安装安卓版本；不会使用云端替代。'))
const browserStatus: ModelStatus = {
  state: 'unsupported', modelId: 'qwen3.5-0.8b-q4_k_m', modelName: 'Qwen3.5 0.8B Q4_K_M',
  modelPresent: false, projectorPresent: false, downloadedBytes: 0, totalBytes: 737504352,
  progress: 0, totalMemoryBytes: 0, availableMemoryBytes: 0, freeStorageBytes: 0,
  recommendedMemoryBytes: 6 * 1024 ** 3, canLoad: false, loaded: false, visionSupported: false,
  speechSupported: false, engineVersion: 'NeoLocalAI cc1ffc71c6d0 / llama.cpp + libmtmd',
  error: '请安装安卓版本使用本机 AI；网页预览不会调用云端识别。',
}

// The native plugin owns model files, private media and the offline inference session.
export const localAi: LocalAiPlugin = {
  listModels: () => isNativeLocalAiAvailable() ? nativePlugin.listModels() : Promise.resolve({ models: [] }),
  selectModel: (options) => isNativeLocalAiAvailable() ? nativePlugin.selectModel(options) : unavailable(),
  getStatus: () => isNativeLocalAiAvailable() ? nativePlugin.getStatus() : Promise.resolve(browserStatus),
  downloadModels: () => isNativeLocalAiAvailable() ? nativePlugin.downloadModels() : unavailable(),
  cancelDownload: () => isNativeLocalAiAvailable() ? nativePlugin.cancelDownload() : unavailable(),
  importModel: (options) => isNativeLocalAiAvailable() ? nativePlugin.importModel(options) : unavailable(),
  loadModel: () => isNativeLocalAiAvailable() ? nativePlugin.loadModel() : unavailable(),
  unloadModel: () => isNativeLocalAiAvailable() ? nativePlugin.unloadModel() : unavailable(),
  selectImage: (options) => isNativeLocalAiAvailable() ? nativePlugin.selectImage(options) : unavailable(),
  selectVideo: (options) => isNativeLocalAiAvailable() ? nativePlugin.selectVideo(options) : unavailable(),
  clearMedia: () => isNativeLocalAiAvailable() ? nativePlugin.clearMedia() : unavailable(),
  transcribeSpeech: () => isNativeLocalAiAvailable() ? nativePlugin.transcribeSpeech() : unavailable(),
  stopSpeech: () => isNativeLocalAiAvailable() ? nativePlugin.stopSpeech() : unavailable(),
  generate: (options) => isNativeLocalAiAvailable() ? nativePlugin.generate(options) : unavailable(),
  stopGeneration: () => isNativeLocalAiAvailable() ? nativePlugin.stopGeneration() : unavailable(),
  addListener: (event, callback) => isNativeLocalAiAvailable()
    ? nativePlugin.addListener(event, callback)
    : Promise.resolve({ remove: async () => {} }),
}

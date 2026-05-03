import appIconAssetPath from '../../../resources/icon.png?asset'
import macOSTrayIconAssetPath from '../../../resources/tray-icon-macos.png?asset'

/**
 * Shared AIRI window icon asset path for Electron main-process surfaces.
 *
 * Use when:
 * - Creating BrowserWindow instances from the main process
 * - Setting the application or dock icon during desktop startup
 *
 * Expects:
 * - Electron Vite asset handling is available in the main bundle
 *
 * Returns:
 * - The resolved icon asset path emitted by the bundler
 */
export const mainProcessIconAssetPath = appIconAssetPath

/**
 * Shared macOS tray icon asset path for the Electron tray.
 *
 * Use when:
 * - Creating the macOS tray image from the main process
 *
 * Expects:
 * - Electron Vite asset handling is available in the main bundle
 *
 * Returns:
 * - The resolved tray icon asset path emitted by the bundler
 */
export const mainProcessMacOSTrayIconAssetPath = macOSTrayIconAssetPath

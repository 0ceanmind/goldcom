// One interface for every phone Claude can film with. The capture agent only talks to a driver, so an Android
// device over ADB (emulator, cloud phone, USB phone) and a cloud device over Appium (e.g. a real iPhone) work alike.
// Coordinates are in the device's own units (pixels on Android, points on iOS), as reported by info().
import * as A from './adb.mjs';

export function adbDriver(serial) {
  return {
    kind: 'adb',
    platform: 'android',
    id: serial,
    info: () => A.deviceInfo(serial),
    findPackage: () => A.findGoldcomPackage(serial),
    launch: (pkg, opts) => A.launchApp(serial, pkg, opts),
    screenshot: () => A.screencap(serial),
    elements: () => A.uiDump(serial),
    tap: (x, y) => A.tap(serial, x, y),
    swipe: (x1, y1, x2, y2, ms) => A.swipe(serial, x1, y1, x2, y2, ms),
    type: (text) => A.typeText(serial, text),
    back: () => A.keyevent(serial, A.KEY.back),
    demoMode: (on) => A.demoMode(serial, on),
    startRecording: (opts) => A.startRecording(serial, opts),
    startTouchLog: (info) => A.startTouchLog(serial, info),
  };
}

/** A driver from either a driver object or an adb serial. */
export const toDriver = (target) => (typeof target === 'string' ? adbDriver(target) : target);

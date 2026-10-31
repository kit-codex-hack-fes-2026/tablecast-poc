// 端末画面の論理サイズをCSS pixelで指定する。
export const demoDevices = {
  ipad: { label: "iPad", width: 820, height: 1180, bezel: 56, silver: true },
  "ipad-air-11": { label: "iPad Air 11″", width: 820, height: 1180, bezel: 54, silver: false },
  "ipad-air-13": { label: "iPad Air 13″", width: 1024, height: 1366, bezel: 46, silver: false },
};
export type DemoDevice = "browser" | keyof typeof demoDevices;

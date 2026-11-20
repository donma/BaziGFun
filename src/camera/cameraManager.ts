/**
 * 相機管理：getUserMedia、啟停、拍照幀擷取。
 * 僅使用後置鏡頭（environment）；不假設一定成功，錯誤完整上拋。
 */

export type CameraState = "idle" | "starting" | "running" | "failed" | "denied";

export interface CameraManager {
  start(): Promise<void>;
  stop(): void;
  /** 擷取當前幀到 canvas（以 video 原生解析度） */
  captureFrame(): HTMLCanvasElement | null;
  video: HTMLVideoElement | null;
  state: CameraState;
}

export function createCameraManager(): CameraManager {
  let stream: MediaStream | null = null;
  const video = document.createElement("video");
  video.setAttribute("playsinline", "true");
  video.setAttribute("autoplay", "true");
  video.muted = true;
  let state: CameraState = "idle";

  return {
    video,
    get state() {
      return state;
    },
    async start() {
      if (state === "running" || state === "starting") return;
      state = "starting";
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "environment",
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });
        video.srcObject = stream;
        await video.play();
        state = "running";
      } catch (err) {
        const name = (err as DOMException)?.name;
        state = name === "NotAllowedError" ? "denied" : "failed";
        throw err;
      }
    },
    stop() {
      stream?.getTracks().forEach((t) => t.stop());
      stream = null;
      video.srcObject = null;
      if (state === "running" || state === "starting") state = "idle";
    },
    captureFrame(): HTMLCanvasElement | null {
      if (state !== "running") return null;
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (!vw || !vh) return null;
      const canvas = document.createElement("canvas");
      canvas.width = vw;
      canvas.height = vh;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(video, 0, 0, vw, vh);
      return canvas;
    },
  };
}

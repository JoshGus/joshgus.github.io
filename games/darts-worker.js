try {
  const { HandLandmarker, FilesetResolver } = await import(
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs'
  );
  const vision = await FilesetResolver.forVisionTasks(
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
  );
  const landmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
      delegate: 'GPU',
    },
    numHands: 2,
    runningMode: 'VIDEO',
    minHandDetectionConfidence: 0.5,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
  self.postMessage({ type: 'ready' });
  self.onmessage = ({ data }) => {
    if (data.type !== 'frame') return;
    const { bitmap, t } = data;
    const t0 = performance.now();
    const r = landmarker.detectForVideo(bitmap, t);
    const elapsed = performance.now() - t0;
    bitmap.close();
    const hands = (r.landmarks || []).map((lms, i) => ({
      landmarks: lms,
      handedness: r.handednesses?.[i]?.[0]?.displayName ?? 'Unknown',
    }));
    self.postMessage({ type: 'landmarks', hands, elapsed });
  };
} catch (e) {
  self.postMessage({ type: 'error', message: String(e) });
}

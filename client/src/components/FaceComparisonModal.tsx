import { useState, useRef, useEffect } from 'react';
import {
  ShieldCheck,
  X,
  Upload,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Scan,
  Cpu,
  Sparkles,
  Sliders,
  Camera,
  Video,
  VideoOff,
  RotateCcw,
  Check,
  Trash2,
  Info,
} from 'lucide-react';
import { compareFaces, BiometricMatchResult } from '../lib/biometrics';
import { api } from '../lib/api';

export interface FaceComparisonModalProps {
  isOpen: boolean;
  onClose: () => void;
  referencePhotoUrl: string;
  candidateName?: string;
  credentialId?: string;
  initialThreshold?: number;
  onMatchComplete?: (result: BiometricMatchResult) => void;
}

const PRESET_DEMO_PHOTOS = [
  {
    name: 'Same Candidate (Interview Photo)',
    url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=256&auto=format&fit=crop&q=80',
    type: 'match',
  },
  {
    name: 'Same Candidate (Casual Selfie)',
    url: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=256&auto=format&fit=crop&q=80',
    type: 'match',
  },
  {
    name: 'Different Candidate (Impersonation)',
    url: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=256&auto=format&fit=crop&q=80',
    type: 'mismatch',
  },
];

export function FaceComparisonModal({
  isOpen,
  onClose,
  referencePhotoUrl,
  candidateName = 'Candidate',
  credentialId,
  initialThreshold = 75,
  onMatchComplete,
}: FaceComparisonModalProps) {
  // Submitted / Reference Photo state (allows using provided reference or uploading custom submitted photo)
  const [submittedPhoto, setSubmittedPhoto] = useState<string>(
    referencePhotoUrl || PRESET_DEMO_PHOTOS[0].url
  );

  // Active candidate photo & source mode
  const [candidatePhoto, setCandidatePhoto] = useState<string>(PRESET_DEMO_PHOTOS[0].url);
  const [sourceMode, setSourceMode] = useState<'camera' | 'upload' | 'presets'>('camera');
  
  // Camera state
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [cameraLoading, setCameraLoading] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);

  // Analysis & verdict state
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<BiometricMatchResult | null>(null);
  const [auditSaved, setAuditSaved] = useState(false);
  const [threshold, setThreshold] = useState<number>(initialThreshold);

  // DOM Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const refFileInputRef = useRef<HTMLInputElement>(null);

  // Sync referencePhotoUrl if prop changes
  useEffect(() => {
    if (referencePhotoUrl) {
      setSubmittedPhoto(referencePhotoUrl);
    }
  }, [referencePhotoUrl]);

  // Clean up camera stream
  const stopCamera = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch (e) {
          console.warn('Error stopping video track:', e);
        }
      });
      mediaStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
    setCameraLoading(false);
  };

  // Start webcam
  const startCamera = async () => {
    stopCamera();
    setCameraLoading(true);
    setCameraError(null);
    setCapturedPhoto(null);

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera device API is not supported in this browser environment');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: false,
      });

      mediaStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setCameraActive(true);
    } catch (err: any) {
      console.warn('Camera access could not be established:', err);
      const isDenied = err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError';
      setCameraError(
        isDenied
          ? 'Camera permission denied. Please allow camera permissions in your browser or upload a photo below.'
          : 'Camera device unavailable or not detected. You can upload a photo to compare.'
      );
      setCameraActive(false);
    } finally {
      setCameraLoading(false);
    }
  };

  // Stop camera when modal is closed
  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      setCapturedPhoto(null);
      setCameraError(null);
      setResult(null);
    } else {
      // Auto-start camera if in camera mode
      if (sourceMode === 'camera' && !capturedPhoto) {
        startCamera();
      }
    }
  }, [isOpen]);

  // Handle switching tabs
  const handleModeChange = (mode: 'camera' | 'upload' | 'presets') => {
    setSourceMode(mode);
    if (mode === 'camera') {
      if (!capturedPhoto && !cameraActive) {
        startCamera();
      }
    } else {
      stopCamera();
    }
  };

  // Capture still from active camera
  const capturePhoto = (delaySec: number = 0) => {
    if (delaySec > 0) {
      setCountdown(delaySec);
      const timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev === null || prev <= 1) {
            clearInterval(timer);
            executeCapture();
            return null;
          }
          return prev - 1;
        });
      }, 1000);
      return;
    }
    executeCapture();
  };

  const executeCapture = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    const width = video.videoWidth || 640;
    const height = video.videoHeight || 480;
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Mirror horizontal to match mirror-effect preview
    ctx.translate(width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, width, height);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
    setCapturedPhoto(dataUrl);
    setCandidatePhoto(dataUrl);
    stopCamera();

    // Automatically run biometric comparison against the submitted photo
    handleRunComparison(dataUrl, submittedPhoto);
  };

  const retakePhoto = () => {
    setCapturedPhoto(null);
    startCamera();
  };

  // Recalculate verdict whenever threshold changes
  useEffect(() => {
    if (result) {
      const dynamicVerdict =
        result.similarityScore >= threshold
          ? 'MATCH'
          : result.similarityScore >= Math.max(40, threshold - 15)
          ? 'PARTIAL'
          : 'MISMATCH';
      if (result.verdict !== dynamicVerdict) {
        const updated = { ...result, verdict: dynamicVerdict as any };
        setResult(updated);
        onMatchComplete?.(updated);
      }
    }
  }, [threshold]);

  // Comparison logic
  const handleRunComparison = async (photoUrlToUse?: string, refUrlToUse?: string) => {
    const photoToAnalyze = photoUrlToUse || candidatePhoto;
    const refToAnalyze = refUrlToUse || submittedPhoto;

    setAnalyzing(true);
    setResult(null);
    setAuditSaved(false);

    try {
      // Short delay for scanner animation visual feedback
      await new Promise((r) => setTimeout(r, 650));
      const res = await compareFaces(refToAnalyze, photoToAnalyze);

      const dynamicVerdict =
        res.similarityScore >= threshold
          ? 'MATCH'
          : res.similarityScore >= Math.max(40, threshold - 15)
          ? 'PARTIAL'
          : 'MISMATCH';
      const adjusted = { ...res, verdict: dynamicVerdict as any };
      setResult(adjusted);
      onMatchComplete?.(adjusted);

      // Record biometric audit log on server
      try {
        await api.post('/kyc/aadhaar/biometric-audit', {
          credentialId: credentialId || null,
          similarityScore: res.similarityScore,
          verdict: dynamicVerdict,
          notes: `Live camera biometric comparison performed for ${candidateName}. Threshold: ${threshold}%. Verdict: ${dynamicVerdict}`,
        });
        setAuditSaved(true);
      } catch (err) {
        console.warn('Could not record biometric audit', err);
      }
    } catch (err) {
      console.error('Biometric analysis error:', err);
    } finally {
      setAnalyzing(false);
    }
  };

  // Upload candidate photo (Right side)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (dataUrl) {
        setCandidatePhoto(dataUrl);
        setCapturedPhoto(dataUrl);
        handleRunComparison(dataUrl, submittedPhoto);
      }
    };
    reader.readAsDataURL(file);
  };

  // Upload custom submitted / reference photo (Left side)
  const handleSubmittedPhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (dataUrl) {
        setSubmittedPhoto(dataUrl);
        handleRunComparison(candidatePhoto, dataUrl);
      }
    };
    reader.readAsDataURL(file);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl bg-white dark:bg-[#0B1B3A] border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/40">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-500/10 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
              <Camera className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                Assistive Camera Face Comparison
                <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> Experimental Screening Demo
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Live browser-side visual screening against {candidateName}&apos;s submitted credential photo
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Privacy & Ethical AI Disclaimer Banner */}
          <div className="p-3.5 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200/50 dark:border-indigo-800/40 text-indigo-900 dark:text-indigo-300 flex items-start gap-3">
            <Info className="w-4 h-4 flex-shrink-0 text-indigo-500 mt-0.5" />
            <div className="text-[11px] leading-relaxed">
              <span className="font-bold">Privacy Notice &amp; Informed Consent:</span>
              {' '}Camera capture executes entirely inside your local browser session. Visual feature comparisons (histogram, contour gradients, structural correlation) are assistive screening tools only and do NOT constitute a legally binding biometric identification. Frames are discarded upon closing unless an audit is explicitly requested.
            </div>
          </div>

          {/* Side by Side Photos */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left: Submitted / Official Record Photo */}
            <div className="flex flex-col items-center p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 relative">
              <div className="w-full flex items-center justify-between mb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                  Submitted Photo (Official Record)
                </span>
                <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  SEALED IN RECORD
                </span>
              </div>

              <div className="relative w-52 h-52 rounded-2xl overflow-hidden border-2 border-emerald-500/40 shadow-md bg-slate-100 dark:bg-slate-800">
                <img
                  src={submittedPhoto}
                  alt="Submitted Official Reference"
                  className="w-full h-full object-cover"
                />
                {/* Facial Mesh Landmarks */}
                <div className="absolute inset-0 pointer-events-none">
                  <div className="absolute inset-4 border border-dashed border-emerald-400/60 rounded-xl" />
                  <div className="absolute top-1/4 left-1/3 w-1.5 h-1.5 bg-emerald-400 rounded-full animate-ping" />
                  <div className="absolute top-1/4 right-1/3 w-1.5 h-1.5 bg-emerald-400 rounded-full animate-ping" />
                  <div className="absolute bottom-1/3 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-emerald-400 rounded-full" />
                </div>
              </div>

              {/* Submitted Photo Source & Change Option */}
              <div className="mt-3 w-full flex flex-col items-center gap-1.5">
                <p className="text-xs text-center text-slate-600 dark:text-slate-400 font-medium">
                  Official candidate record on file
                </p>
                <input
                  type="file"
                  ref={refFileInputRef}
                  onChange={handleSubmittedPhotoUpload}
                  accept="image/*"
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => refFileInputRef.current?.click()}
                  className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <Upload className="w-3 h-3" />
                  Change / Upload Submitted Photo
                </button>
              </div>
            </div>

            {/* Right: Camera / Candidate Verification Photo */}
            <div className="flex flex-col items-center p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 relative">
              <div className="w-full flex items-center justify-between mb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <Cpu className="w-3.5 h-3.5 text-indigo-500" />
                  Live Verification Photo
                </span>
                <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                  {capturedPhoto ? 'PHOTO READY' : cameraActive ? 'LIVE WEBCAM' : 'SELECT SOURCE'}
                </span>
              </div>

              {/* Source Switcher Tabs */}
              <div className="w-full grid grid-cols-3 gap-1 p-1 bg-slate-200/70 dark:bg-slate-800/80 rounded-xl mb-3 text-xs">
                <button
                  type="button"
                  onClick={() => handleModeChange('camera')}
                  className={`py-1.5 rounded-lg font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    sourceMode === 'camera'
                      ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  <Camera className="w-3.5 h-3.5" />
                  Live Camera
                </button>
                <button
                  type="button"
                  onClick={() => handleModeChange('upload')}
                  className={`py-1.5 rounded-lg font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    sourceMode === 'upload'
                      ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  <Upload className="w-3.5 h-3.5" />
                  Upload
                </button>
                <button
                  type="button"
                  onClick={() => handleModeChange('presets')}
                  className={`py-1.5 rounded-lg font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    sourceMode === 'presets'
                      ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Presets
                </button>
              </div>

              {/* Viewfinder Container */}
              <div className="relative w-52 h-52 rounded-2xl overflow-hidden border-2 border-indigo-500/40 shadow-md bg-slate-900 flex items-center justify-center">
                {/* 1. Live Video Viewfinder */}
                {sourceMode === 'camera' && !capturedPhoto && (
                  <>
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className={`w-full h-full object-cover scale-x-[-1] transition-opacity duration-300 ${
                        cameraActive ? 'opacity-100' : 'opacity-0'
                      }`}
                    />

                    {/* Camera is Loading / Off / Errored */}
                    {!cameraActive && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center bg-slate-900/90 text-white">
                        {cameraLoading ? (
                          <div className="flex flex-col items-center gap-2">
                            <RefreshCw className="w-6 h-6 animate-spin text-indigo-400" />
                            <span className="text-xs font-medium">Opening camera...</span>
                          </div>
                        ) : cameraError ? (
                          <div className="flex flex-col items-center gap-2">
                            <VideoOff className="w-6 h-6 text-amber-400" />
                            <p className="text-[11px] text-amber-200 leading-tight">
                              {cameraError}
                            </p>
                            <button
                              type="button"
                              onClick={startCamera}
                              className="mt-1 px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-xs font-semibold"
                            >
                              Retry Camera
                            </button>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center gap-2">
                            <Video className="w-7 h-7 text-indigo-400" />
                            <span className="text-xs font-semibold">Webcam Standby</span>
                            <button
                              type="button"
                              onClick={startCamera}
                              className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md cursor-pointer flex items-center gap-1.5"
                            >
                              <Camera className="w-3.5 h-3.5" />
                              Turn On Camera
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Active Biometric HUD Overlay */}
                    {cameraActive && (
                      <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
                        {/* Oval Face Alignment Guide */}
                        <div className="w-32 h-44 border-2 border-dashed border-emerald-400/90 rounded-[50%] shadow-[0_0_15px_rgba(52,211,153,0.3)] animate-pulse" />
                        
                        {/* Corner Reticles */}
                        <div className="absolute top-2 left-2 w-3 h-3 border-t-2 border-l-2 border-indigo-400" />
                        <div className="absolute top-2 right-2 w-3 h-3 border-t-2 border-r-2 border-indigo-400" />
                        <div className="absolute bottom-2 left-2 w-3 h-3 border-b-2 border-l-2 border-indigo-400" />
                        <div className="absolute bottom-2 right-2 w-3 h-3 border-b-2 border-r-2 border-indigo-400" />

                        {/* Top Guide Text */}
                        <div className="absolute top-2 bg-black/60 backdrop-blur-sm px-2 py-0.5 rounded-full text-[10px] font-bold text-white tracking-wider uppercase">
                          Align Face Here
                        </div>

                        {/* Countdown Indicator */}
                        {countdown !== null && (
                          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center">
                            <span className="text-5xl font-black text-white animate-ping">
                              {countdown}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}

                {/* 2. Photo Captured or Selected Preview */}
                {(capturedPhoto || sourceMode !== 'camera') && (
                  <div className="relative w-full h-full">
                    <img
                      src={candidatePhoto}
                      alt="Candidate Verification Preview"
                      className="w-full h-full object-cover"
                    />

                    {/* Radar Scanning Line Animation during analysis */}
                    {analyzing && (
                      <div className="absolute inset-0 bg-indigo-500/25 flex flex-col items-center justify-center">
                        <div className="w-full h-1 bg-gradient-to-r from-transparent via-emerald-400 to-transparent animate-pulse absolute top-1/2 -translate-y-1/2 shadow-lg shadow-emerald-500/50" />
                        <span className="text-xs font-bold text-white bg-black/70 px-2 py-1 rounded-md backdrop-blur-sm">
                          Extracting Features...
                        </span>
                      </div>
                    )}

                    {/* Captured via Camera Badge */}
                    {capturedPhoto && (
                      <div className="absolute bottom-2 left-2 right-2 flex items-center justify-center">
                        <span className="px-2 py-0.5 bg-emerald-600/90 text-white text-[10px] font-bold rounded-full shadow-md flex items-center gap-1 backdrop-blur-sm">
                          <Check className="w-3 h-3" /> Photo Captured
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Controls below right photo */}
              <div className="mt-3 flex items-center gap-2">
                {sourceMode === 'camera' && (
                  <>
                    {!capturedPhoto ? (
                      cameraActive ? (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => capturePhoto(0)}
                            className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-indigo-600 hover:from-emerald-600 hover:to-indigo-700 text-white text-xs font-bold shadow-md shadow-indigo-500/30 flex items-center gap-1.5 cursor-pointer transition-all"
                          >
                            <Camera className="w-4 h-4" />
                            Take Photo
                          </button>
                          <button
                            type="button"
                            onClick={() => capturePhoto(3)}
                            title="Take photo with 3 second delay"
                            className="px-2.5 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold cursor-pointer"
                          >
                            3s Timer
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={startCamera}
                          className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-sm"
                        >
                          <Camera className="w-3.5 h-3.5" />
                          Start Camera
                        </button>
                      )
                    ) : (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={retakePhoto}
                          className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-indigo-500 text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
                        >
                          <RotateCcw className="w-3.5 h-3.5 text-indigo-500" />
                          Retake Photo
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setCapturedPhoto(null);
                            setCandidatePhoto(PRESET_DEMO_PHOTOS[0].url);
                            setResult(null);
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 text-xs font-semibold flex items-center gap-1 cursor-pointer hover:bg-red-100"
                          title="Discard captured image from memory"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Clear Photo
                        </button>
                      </div>
                    )}
                  </>
                )}

                {sourceMode === 'upload' && (
                  <>
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileUpload}
                      accept="image/*"
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-3.5 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-indigo-500 text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5 text-indigo-500" />
                      Choose Photo from Device
                    </button>
                  </>
                )}

                {sourceMode === 'presets' && (
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    Select a preset below to test matching
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Quick Demo Presets (Visible when preset mode is active or as secondary fallback) */}
          {sourceMode === 'presets' && (
            <div className="p-3.5 rounded-2xl bg-slate-100/70 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-2">
                Instant Demo Verification Presets:
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {PRESET_DEMO_PHOTOS.map((p, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setCandidatePhoto(p.url);
                      setCapturedPhoto(null);
                      handleRunComparison(p.url, submittedPhoto);
                    }}
                    className={`p-2.5 text-left rounded-xl text-xs font-medium border transition-all cursor-pointer ${
                      candidatePhoto === p.url && !capturedPhoto
                        ? 'bg-indigo-500/10 border-indigo-500 text-indigo-600 dark:text-indigo-400 shadow-sm'
                        : 'bg-white dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-slate-400'
                    }`}
                  >
                    <div className="font-semibold truncate">{p.name}</div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                      {p.type === 'match' ? '✓ Positive Test (High Match)' : '✗ Negative Test (Impersonation)'}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Biometric Confidence Threshold Slider */}
          <div className="p-3.5 rounded-2xl bg-slate-100/70 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between mb-1.5 text-xs">
              <span className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-indigo-500" />
                Biometric Match Threshold:
              </span>
              <span className="font-bold font-mono text-indigo-600 dark:text-indigo-400">
                {threshold}% (Required for MATCH)
              </span>
            </div>
            <input
              type="range"
              min="50"
              max="95"
              step="1"
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              className="w-full accent-indigo-600 cursor-pointer h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg"
            />
            <div className="flex justify-between text-[10px] text-slate-500 dark:text-slate-400 mt-1">
              <span>Lenient (50%)</span>
              <span>Balanced (75%)</span>
              <span>Strict Security (95%)</span>
            </div>
          </div>

          {/* Action Trigger */}
          <div className="flex justify-center">
            <button
              type="button"
              disabled={analyzing}
              onClick={() => handleRunComparison()}
              className="px-7 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-indigo-600 hover:from-emerald-600 hover:to-indigo-700 text-white font-bold text-sm shadow-lg shadow-indigo-500/20 flex items-center gap-2 transition-all disabled:opacity-50 cursor-pointer"
            >
              {analyzing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Running Neural Feature Extraction...
                </>
              ) : (
                <>
                  <Scan className="w-4 h-4" />
                  Compare Live Photo to Submitted Photo
                </>
              )}
            </button>
          </div>

          {/* Biometric Results Panel */}
          {result && (
            <div
              className={`p-5 rounded-2xl border transition-all ${
                result.verdict === 'MATCH'
                  ? 'bg-emerald-500/10 border-emerald-500/30'
                  : result.verdict === 'PARTIAL'
                  ? 'bg-amber-500/10 border-amber-500/30'
                  : 'bg-red-500/10 border-red-500/30'
              }`}
            >
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  {result.verdict === 'MATCH' ? (
                    <div className="p-3 rounded-xl bg-emerald-500 text-white shadow-md shadow-emerald-500/30">
                      <CheckCircle2 className="w-7 h-7" />
                    </div>
                  ) : result.verdict === 'PARTIAL' ? (
                    <div className="p-3 rounded-xl bg-amber-500 text-white shadow-md shadow-amber-500/30">
                      <AlertTriangle className="w-7 h-7" />
                    </div>
                  ) : (
                    <div className="p-3 rounded-xl bg-red-500 text-white shadow-md shadow-red-500/30">
                      <XCircle className="w-7 h-7" />
                    </div>
                  )}

                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">
                      {result.verdict === 'MATCH'
                        ? 'High Visual Similarity (Resembles Record Photo)'
                        : result.verdict === 'PARTIAL'
                        ? 'Inconclusive Comparison — Manual Review Recommended'
                        : 'Visual Feature Mismatch — Identity Verification Required'}
                    </h3>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                      Visual Score: <span className="font-semibold">{result.similarityScore}%</span> &bull;
                      Screening Level: <span className="font-semibold capitalize">{result.confidence}</span>
                      {auditSaved && ' &bull; Logged to Verification Audit Ledger'}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 italic mt-1">
                      Note: Assistive visual comparison only; does not replace authoritative government ID verification.
                    </p>
                  </div>
                </div>

                {/* Score Gauge */}
                <div className="text-right">
                  <div
                    className={`text-3xl font-black ${
                      result.verdict === 'MATCH'
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : result.verdict === 'PARTIAL'
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-red-600 dark:text-red-400'
                    }`}
                  >
                    {result.similarityScore}%
                  </div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Similarity Score
                  </div>
                </div>
              </div>

              {/* Feature Metrics Matrix */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-slate-200 dark:border-slate-800">
                <div className="p-2.5 rounded-xl bg-white/60 dark:bg-slate-900/60 text-center">
                  <div className="text-xs text-slate-500 dark:text-slate-400">Structure (SSIM)</div>
                  <div className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">
                    {result.metrics.structuralScore}%
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-white/60 dark:bg-slate-900/60 text-center">
                  <div className="text-xs text-slate-500 dark:text-slate-400">Chroma Hist</div>
                  <div className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">
                    {result.metrics.colorHistogramScore}%
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-white/60 dark:bg-slate-900/60 text-center">
                  <div className="text-xs text-slate-500 dark:text-slate-400">Contour Edge</div>
                  <div className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">
                    {result.metrics.edgeGradientScore}%
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-white/60 dark:bg-slate-900/60 text-center">
                  <div className="text-xs text-slate-500 dark:text-slate-400">Vector Dist</div>
                  <div className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">
                    {result.metrics.featureVectorDistance}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/40 flex items-center justify-between">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {result ? `Status: ${result.verdict} (${result.similarityScore}% similarity)` : 'No comparison executed yet'}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                stopCamera();
                onClose();
              }}
              className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-xs transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                if (result) onMatchComplete?.(result);
                stopCamera();
                onClose();
              }}
              className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs shadow-md shadow-indigo-500/20 transition-colors cursor-pointer"
            >
              Apply Verdict &amp; Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

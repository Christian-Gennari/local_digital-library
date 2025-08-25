// src/hooks/useAudioDuration.ts
import { useEffect, useState } from "react";

interface UseAudioDurationResult {
  duration: number | null;
  format: string | null;
  isLoading: boolean;
  error: string | null;
}

export function useAudioDuration(
  file: File | null,
  itemType: string
): UseAudioDurationResult {
  const [duration, setDuration] = useState<number | null>(null);
  const [format, setFormat] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Reset state when file changes
    setDuration(null);
    setFormat(null);
    setError(null);

    // Only process audio files
    if (!file || itemType !== "audiobook") {
      return;
    }

    const audioExtensions = [
      ".mp3",
      ".m4a",
      ".m4b",
      ".wav",
      ".aac",
      ".flac",
      ".ogg",
    ];
    const hasAudioExtension = audioExtensions.some((ext) =>
      file.name.toLowerCase().endsWith(ext)
    );

    if (!hasAudioExtension) {
      return;
    }

    // Detect format from file extension and MIME type
    const detectFormat = (fileName: string, mimeType?: string): string => {
      const lowerName = fileName.toLowerCase();

      // Check file extension first
      if (lowerName.endsWith(".mp3")) return "mp3";
      if (lowerName.endsWith(".m4a")) return "m4a";
      if (lowerName.endsWith(".m4b")) return "m4b";
      if (lowerName.endsWith(".aac")) return "aac";
      if (lowerName.endsWith(".flac")) return "flac";
      if (lowerName.endsWith(".ogg") || lowerName.endsWith(".oga"))
        return "ogg";
      if (lowerName.endsWith(".wav")) return "wav";
      if (lowerName.endsWith(".wma")) return "wma";
      if (lowerName.endsWith(".opus")) return "opus";

      // Fallback to MIME type if available
      if (mimeType) {
        if (mimeType.includes("mp3") || mimeType.includes("mpeg")) return "mp3";
        if (mimeType.includes("mp4") || mimeType.includes("m4a")) return "m4a";
        if (mimeType.includes("m4b")) return "m4b";
        if (mimeType.includes("aac")) return "aac";
        if (mimeType.includes("flac")) return "flac";
        if (mimeType.includes("ogg") || mimeType.includes("opus")) return "ogg";
        if (mimeType.includes("wav")) return "wav";
      }

      return "other";
    };

    let audio: HTMLAudioElement | null = null;
    let objectUrl: string | null = null;
    let mounted = true;

    const detectDuration = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Detect and set format immediately
        const detectedFormat = detectFormat(file.name, file.type);
        setFormat(detectedFormat);

        // Create object URL from file
        objectUrl = URL.createObjectURL(file);

        // Create audio element
        audio = new Audio();

        // Preload metadata only (not the entire file)
        audio.preload = "metadata";

        // Set up promise-based loading
        await new Promise<void>((resolve, reject) => {
          if (!audio || !objectUrl) {
            reject(new Error("Audio element not initialized"));
            return;
          }

          const timeoutId = setTimeout(() => {
            reject(new Error("Duration detection timeout (10s)"));
          }, 10000);

          const handleLoadedMetadata = () => {
            clearTimeout(timeoutId);
            if (audio && mounted) {
              const detectedDuration = audio.duration;

              // Validate duration
              if (isFinite(detectedDuration) && detectedDuration > 0) {
                setDuration(Math.floor(detectedDuration));
                resolve();
              } else {
                reject(new Error("Invalid duration detected"));
              }
            }
          };

          const handleError = (e: Event) => {
            clearTimeout(timeoutId);
            const audioError = (e.target as HTMLAudioElement).error;
            let errorMessage = "Failed to load audio file";

            if (audioError) {
              switch (audioError.code) {
                case MediaError.MEDIA_ERR_ABORTED:
                  errorMessage = "Audio loading was aborted";
                  break;
                case MediaError.MEDIA_ERR_NETWORK:
                  errorMessage = "Network error while loading audio";
                  break;
                case MediaError.MEDIA_ERR_DECODE:
                  errorMessage = "Audio file format not supported or corrupted";
                  break;
                case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
                  errorMessage = "Audio format not supported";
                  break;
              }
            }

            reject(new Error(errorMessage));
          };

          // Attach event listeners
          audio.addEventListener("loadedmetadata", handleLoadedMetadata);
          audio.addEventListener("error", handleError);

          // Some browsers need this to trigger metadata loading
          audio.addEventListener("canplay", handleLoadedMetadata);

          // Set source and trigger load
          audio.src = objectUrl;

          // Explicitly call load() to ensure metadata loading starts
          audio.load();
        });
      } catch (err) {
        if (mounted) {
          console.error("Audio duration detection failed:", err);
          setError(err instanceof Error ? err.message : "Unknown error");
          setDuration(null);
          // Keep format even if duration fails
        }
      } finally {
        // Cleanup
        if (mounted) {
          setIsLoading(false);
        }

        // Clean up audio element
        if (audio) {
          audio.pause();
          audio.src = "";
          audio.load();
          audio = null;
        }

        // Revoke object URL after a delay to ensure it's not still being used
        if (objectUrl) {
          const urlToRevoke = objectUrl;
          setTimeout(() => {
            URL.revokeObjectURL(urlToRevoke);
          }, 100);
        }
      }
    };

    detectDuration();

    // Cleanup function
    return () => {
      mounted = false;

      if (audio) {
        audio.pause();
        audio.src = "";
        audio.load();
      }

      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [file?.name, itemType]); // Use file.name to trigger re-detection when file changes

  return { duration, format, isLoading, error };
}

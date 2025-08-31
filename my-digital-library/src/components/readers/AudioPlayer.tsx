// src/components/BookViewer.tsx
import {
  memo,
  useEffect,
  useRef,
  useState,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from "react";
import { useStore } from "../../store";
import { ReadingProvider, useReading } from "../ReadingContext";
import { Howl } from "howler";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

export interface AudioPlayerRef {
  seekToTime: (seconds: number) => void;
}

interface AudioPlayerProps {
  audioUrl: string;
  title: string;
  author?: string;
  currentBook: any;
}

const AudioPlayer = forwardRef<AudioPlayerRef, AudioPlayerProps>(
  ({ audioUrl, title, author, currentBook }, ref) => {
    const [sound, setSound] = useState<Howl | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [duration, setDuration] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);
    const { setCurrentReference } = useReading();
    const { updateBookMetadata } = useStore();

    const progressSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const lastSavedProgressRef = useRef<number>(0);

    const saveProgress = useCallback(
      (currentSeconds: number, totalSeconds: number) => {
        if (progressSaveTimeoutRef.current) {
          clearTimeout(progressSaveTimeoutRef.current);
        }

        const progressPercentage =
          totalSeconds > 0 ? (currentSeconds / totalSeconds) * 100 : 0;

        progressSaveTimeoutRef.current = setTimeout(async () => {
          try {
            await updateBookMetadata(currentBook.id, {
              readingProgress: Math.round(progressPercentage),
              lastRead: new Date().toISOString(),
              lastReadPosition: currentSeconds,
            });

            lastSavedProgressRef.current = progressPercentage;
          } catch (error) {
            console.error("Failed to save audio progress:", error);
          }
        }, 150);
      },
      [currentBook.id, updateBookMetadata]
    );

    const formatTime = (seconds: number) => {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      const secs = Math.floor(seconds % 60);

      if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, "0")}:${secs
          .toString()
          .padStart(2, "0")}`;
      }
      return `${minutes}:${secs.toString().padStart(2, "0")}`;
    };

    // Expose seekToTime method via ref
    useImperativeHandle(
      ref,
      () => ({
        seekToTime: (seconds: number) => {
          if (sound && sound.state() === "loaded") {
            const clampedTime = Math.max(0, Math.min(duration, seconds));
            sound.seek(clampedTime);
            setCurrentTime(clampedTime);
            if (duration > 0) {
              saveProgress(clampedTime, duration);
            }
          }
        },
      }),
      [sound, duration, saveProgress]
    );

    useEffect(() => {
      const howl = new Howl({
        src: [audioUrl],
        format: ["mp3", "wav", "m4a", "m4b", "aac", "flac"],
        html5: true,
        preload: true,
        onload: function () {
          const totalDuration = howl.duration();
          setDuration(totalDuration);

          if (
            currentBook.metadata.lastReadPosition &&
            typeof currentBook.metadata.lastReadPosition === "number" &&
            currentBook.metadata.lastReadPosition > 0
          ) {
            const savedPosition = currentBook.metadata.lastReadPosition;
            howl.seek(savedPosition);
            setCurrentTime(savedPosition);
            lastSavedProgressRef.current =
              (savedPosition / totalDuration) * 100;
          }
        },
        onplay: function () {
          setIsPlaying(true);
        },
        onpause: function () {
          setIsPlaying(false);
          const time = howl.seek() as number;
          if (duration > 0) {
            saveProgress(time, duration);
          }
        },
        onend: function () {
          setIsPlaying(false);
          if (duration > 0) {
            updateBookMetadata(currentBook.id, {
              readingProgress: 100,
              lastRead: new Date().toISOString(),
              lastReadPosition: duration,
            });
          }
        },
        onstop: function () {
          setIsPlaying(false);
        },
        onloaderror: function (id, error) {
          console.error("🎵 Error loading audio:", error);
        },
        onplayerror: function (id, error) {
          console.error("🎵 Error playing audio:", error);
        },
      });

      setSound(howl);

      const interval = setInterval(() => {
        if (howl.playing()) {
          const time = howl.seek() as number;
          setCurrentTime(time);

          setCurrentReference({
            type: "timestamp",
            value: formatTime(time),
            raw: time,
          });

          if (duration > 0) {
            saveProgress(time, duration);
          }
        }
      }, 1000);
      return () => {
        clearInterval(interval);
        if (howl && howl.state() === "loaded") {
          const finalTime = howl.seek() as number;
          if (typeof finalTime === "number" && finalTime > 0 && duration > 0) {
            if (progressSaveTimeoutRef.current) {
              clearTimeout(progressSaveTimeoutRef.current);
            }

            const finalProgress = Math.round((finalTime / duration) * 100);
            updateBookMetadata(currentBook.id, {
              readingProgress: finalProgress,
              lastRead: new Date().toISOString(),
              lastReadPosition: finalTime,
            });
          }
        }

        howl.unload();
      };
    }, [audioUrl]);

    useEffect(() => {
      if (sound && duration > 0) {
        const time = sound.seek() as number;
        if (typeof time === "number") {
          saveProgress(time, duration);
        }
      }
    }, [sound, duration, saveProgress]);

    const handleSeek = (event: React.ChangeEvent<HTMLInputElement>) => {
      const seekTime = parseFloat(event.target.value);
      if (sound && sound.state() === "loaded") {
        sound.seek(seekTime);
        setCurrentTime(seekTime);

        if (duration > 0) {
          saveProgress(seekTime, duration);
        }
      }
    };

    const handleSkipBackward = () => {
      if (sound && sound.state() === "loaded") {
        const newTime = Math.max(0, currentTime - 15);
        sound.seek(newTime);
        setCurrentTime(newTime);

        if (duration > 0) {
          saveProgress(newTime, duration);
        }
      }
    };

    const handleSkipForward = () => {
      if (sound && sound.state() === "loaded") {
        const newTime = Math.min(duration, currentTime + 15);
        sound.seek(newTime);
        setCurrentTime(newTime);

        if (duration > 0) {
          saveProgress(newTime, duration);
        }
      }
    };

    const handlePlayPause = () => {
      if (!sound || sound.state() !== "loaded") {
        return;
      }

      if (isPlaying) {
        sound.pause();
      } else {
        sound.play();
      }
    };

    const handleStop = () => {
      if (sound && sound.state() === "loaded") {
        const currentPos = sound.seek() as number;
        if (typeof currentPos === "number" && duration > 0) {
          saveProgress(currentPos, duration);
        }

        sound.stop();
        setCurrentTime(0);
        setIsPlaying(false);
      }
    };

    return (
      <div className="flex items-center justify-center h-full theme-bg-secondary">
        <div className="text-center p-8 theme-bg-primary rounded-2xl shadow-lg max-w-md w-full mx-4">
          <div className="mb-6">
            <div className="mb-4 flex h-16 w-16 items-center justify-center mx-auto rounded-full theme-bg-tertiary">
              <svg
                className="h-8 w-8 theme-text-secondary"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 01-.99-3.467l2.31-.66A2.25 2.25 0 009 15.553z"
                />
              </svg>
            </div>
            <h2 className="text-xl font-sans font-semibold theme-text-primary mb-2">
              {title}
            </h2>
            {author && (
              <p className="text-sm font-serif theme-text-secondary mb-4">
                by {author}
              </p>
            )}
          </div>
          {duration > 0 && (
            <div className="mb-6">
              <input
                type="range"
                min="0"
                max={duration}
                value={currentTime}
                onChange={handleSeek}
                className="w-full h-2 rounded-lg appearance-none cursor-pointer"
                style={{
                  background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${
                    (currentTime / duration) * 100
                  }%, #e2e8f0 ${
                    (currentTime / duration) * 100
                  }%, #e2e8f0 100%)`,
                }}
              />
              <style>{`
      input[type="range"]::-webkit-slider-thumb {
        appearance: none;
        height: 16px;
        width: 16px;
        background-color: #3b82f6;
        border-radius: 9999px;
        border: none;
        margin-top: -4px;
        transition: box-shadow 0.2s ease;
        box-shadow: none;
      }

      input[type="range"]::-webkit-slider-thumb:hover {
        box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.4);
      }

      input[type="range"]::-moz-range-thumb {
        height: 16px;
        width: 16px;
        background-color: #3b82f6;
        border-radius: 9999px;
        border: none;
        box-shadow: none;
        transition: box-shadow 0.2s ease;
      }

      input[type="range"]::-moz-range-thumb:hover {
        box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.4);
      }

      input[type="range"]::-webkit-slider-runnable-track {
        height: 8px;
        border-radius: 9999px;
      }

      input[type="range"]::-moz-range-track {
        height: 8px;
        border-radius: 9999px;
      }
    `}</style>

              <div className="flex justify-between text-xs font-sans theme-text-secondary mt-2">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>
          )}
          <div className="flex justify-center items-center gap-4 mb-6">
            <button
              onClick={handleSkipBackward}
              className="flex h-10 w-10 items-center justify-center rounded-lg theme-bg-tertiary theme-text-primary hover\:theme-bg-tertiary transition-colors cursor-pointer"
              title="Rewind 15s"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21 16.811c0 .864-.933 1.406-1.683.977l-7.108-4.061a1.125 1.125 0 010-1.954l7.108-4.061A1.125 1.125 0 0121 8.688v8.123zM11.25 16.811c0 .864-.933 1.406-1.683.977l-7.108-4.061a1.125 1.125 0 010-1.954L9.567 7.712a1.125 1.125 0 011.683.977v8.122z"
                />
              </svg>
            </button>

            <button
              onClick={handlePlayPause}
              className="flex h-12 w-12 items-center justify-center rounded-full theme-btn-primary hover:theme-btn-primary transition-colors cursor-pointer"
              disabled={!sound || sound.state() !== "loaded"}
            >
              {isPlaying ? (
                <svg
                  className="h-6 w-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15.75 5.25v13.5m-7.5-13.5v13.5"
                  />
                </svg>
              ) : (
                <svg
                  className="h-6 w-6 ml-1"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z"
                  />
                </svg>
              )}
            </button>

            <button
              onClick={handleSkipForward}
              className="flex h-10 w-10 items-center justify-center rounded-lg theme-bg-tertiary theme-text-primary hover\:theme-bg-tertiary transition-colors cursor-pointer"
              title="Forward 15s"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 8.688c0-.864.933-1.405 1.683-.977l7.108 4.062a1.125 1.125 0 010 1.953l-7.108 4.062A1.125 1.125 0 013 16.81V8.688zM12.75 8.688c0-.864.933-1.405 1.683-.977l7.108 4.062a1.125 1.125 0 010 1.953l-7.108 4.062a1.125 1.125 0 01-1.683-.977V8.688z"
                />
              </svg>
            </button>
          </div>

          <button
            onClick={handleStop}
            className="rounded-lg border theme-border px-4 py-2 text-sm font-sans font-medium theme-text-primary hover\:theme-bg-secondary transition-colors cursor-pointer"
          >
            Stop
          </button>
        </div>
      </div>
    );
  }
);

AudioPlayer.displayName = "AudioPlayer";

export default AudioPlayer;

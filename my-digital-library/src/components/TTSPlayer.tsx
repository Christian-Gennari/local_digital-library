// my-digital-library/src/components/TTSPlayer.tsx
import React, { forwardRef, useImperativeHandle } from "react";
import { Book } from "../types";
import { useEpubTTS } from "../hooks/useEpubTTS";

export interface TTSPlayerRef {
  play: () => void;
  stop: () => void;
}

interface TTSPlayerProps {
  book: Book;
  rendition: any;
  startCfi: string;
}

export const TTSPlayer = forwardRef<TTSPlayerRef, TTSPlayerProps>(
  ({ book, rendition, startCfi }, ref) => {
    const {
      isPlaying,
      isPaused,
      isLoading,
      currentChunk,
      totalChunks,
      voices,
      selectedVoice,
      speed,
      error,
      playFromCfi,
      pause,
      resume,
      stop,
      setVoice,
      setSpeed,
      isAvailable,
      skipNext,
      skipPrevious,
    } = useEpubTTS(book, rendition);

    useImperativeHandle(ref, () => ({
      play: () => playFromCfi(startCfi),
      stop,
    }));

    if (!isAvailable) {
      return (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-amber-800">
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
                d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
              />
            </svg>
            <span className="text-sm font-medium">TTS service unavailable</span>
          </div>
        </div>
      );
    }

    return (
      <div className="bg-white rounded-lg shadow-lg border border-slate-200 p-6">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-lg font-semibold text-slate-900">
              Text to Speech
            </h3>
            <button
              onClick={stop}
              className="text-slate-400 hover:text-slate-600 transition-colors"
              title="Close TTS"
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
                  d="M6 18 18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          {/* Voice Selection */}
          <div className="flex gap-4 mb-4">
            <div className="flex-1">
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Voice
              </label>
              <select
                value={selectedVoice}
                onChange={(e) => setVoice(e.target.value)}
                disabled={isPlaying}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-slate-500 focus:border-slate-500 bg-white disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {voices.map((voice) => (
                  <option key={voice.id} value={voice.id}>
                    {voice.name} ({voice.language})
                  </option>
                ))}
              </select>
            </div>

            <div className="w-32">
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Speed
              </label>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSpeed(speed - 0.1)}
                  disabled={isPlaying || speed <= 0.5}
                  className="h-8 w-8 rounded border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <svg
                    className="h-3 w-3 mx-auto"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 12h14"
                    />
                  </svg>
                </button>
                <span className="text-sm font-medium text-slate-700 min-w-[3ch] text-center">
                  {speed.toFixed(1)}x
                </span>
                <button
                  onClick={() => setSpeed(speed + 0.1)}
                  disabled={isPlaying || speed >= 2.0}
                  className="h-8 w-8 rounded border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <svg
                    className="h-3 w-3 mx-auto"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 4.5v15m0 0 6.75-6.75M12 19.5l-6.75-6.75"
                    />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          {/* Progress */}
          {totalChunks > 0 && (
            <div className="mb-4">
              <div className="flex justify-between text-xs text-slate-500 mb-1">
                <span>
                  Chunk {currentChunk + 1} of {totalChunks}
                </span>
                <span>
                  {Math.round(((currentChunk + 1) / totalChunks) * 100)}%
                </span>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 transition-all duration-300"
                  style={{
                    width: `${((currentChunk + 1) / totalChunks) * 100}%`,
                  }}
                />
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={skipPrevious}
            disabled={!isPlaying || currentChunk === 0}
            className="h-10 w-10 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Previous chunk"
          >
            <svg
              className="h-5 w-5 mx-auto"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 16.811c0 .864-.933 1.406-1.683.977l-7.108-4.061a1.125 1.125 0 0 1 0-1.954l7.108-4.061A1.125 1.125 0 0 1 21 8.688v8.123ZM11.25 16.811c0 .864-.933 1.406-1.683.977l-7.108-4.061a1.125 1.125 0 0 1 0-1.954L9.567 7.712a1.125 1.125 0 0 1 1.683.977v8.122Z"
              />
            </svg>
          </button>

      {!isPlaying ? (
            <button
              onClick={() => playFromCfi(startCfi)}
              disabled={isLoading}
              className="h-14 w-14 rounded-full bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
            >
              {isLoading ? (
                <svg
                  className="h-6 w-6 animate-spin"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
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
                    d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z"
                  />
                </svg>
              )}
            </button>
          ) : isPaused ? (
            <button
              onClick={resume}
              className="h-14 w-14 rounded-full bg-slate-900 text-white hover:bg-slate-800 transition-colors flex items-center justify-center"
            >
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
                  d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z"
                />
              </svg>
            </button>
          ) : (
            <button
              onClick={pause}
              className="h-14 w-14 rounded-full bg-slate-900 text-white hover:bg-slate-800 transition-colors flex items-center justify-center"
            >
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
            </button>
          )}

          <button
            onClick={skipNext}
            disabled={!isPlaying || currentChunk >= totalChunks - 1}
            className="h-10 w-10 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Next chunk"
          >
            <svg
              className="h-5 w-5 mx-auto"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="m3 8.689c0-.864.933-1.406 1.683-.977l7.108 4.061a1.125 1.125 0 0 1 0 1.954l-7.108 4.061A1.125 1.125 0 0 1 3 16.811V8.69ZM12.75 8.689c0-.864.933-1.406 1.683-.977l7.108 4.061a1.125 1.125 0 0 1 0 1.954l-7.108 4.061a1.125 1.125 0 0 1-1.683-.977V8.69Z"
              />
            </svg>
          </button>

          <button
            onClick={stop}
            disabled={!isPlaying}
            className="h-10 w-10 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Stop"
          >
            <svg
              className="h-5 w-5 mx-auto"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5.25 7.5A2.25 2.25 0 0 1 7.5 5.25h9a2.25 2.25 0 0 1 2.25 2.25v9a2.25 2.25 0 0 1-2.25 2.25h-9a2.25 2.25 0 0 1-2.25-2.25v-9Z"
              />
            </svg>
          </button>
        </div>

        {/* Reading options removed in CFI-based version */}
      </div>
    );
  }
);

TTSPlayer.displayName = "TTSPlayer";

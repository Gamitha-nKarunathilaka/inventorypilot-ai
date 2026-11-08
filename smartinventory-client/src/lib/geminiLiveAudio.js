export class GeminiLiveAudio {
  constructor({ onEvent, onPlayback, onClose, onError }) {
    this.callbacks = {
      onEvent,
      onPlayback,
      onClose,
      onError,
    };

    this.closed = false;
    this.ready = false;
    this.muted = false;
    this.sources = new Set();
    this.nextTime = 0;
  }

  async start(language = "si") {
    try {
      if (
        !navigator.mediaDevices?.getUserMedia ||
        !window.AudioWorkletNode
      ) {
        throw new Error(
          "Live voice needs microphone access on localhost or HTTPS."
        );
      }

      this.context = new AudioContext();

      await this.context.resume();

      if (this.closed) {
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });

      if (this.closed) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      this.stream = stream;

      await this.context.audioWorklet.addModule(
        new URL("./geminiCapture.worklet.js", import.meta.url)
      );

      if (this.closed) {
        return;
      }

      this.microphone =
        this.context.createMediaStreamSource(stream);

      this.capture = new AudioWorkletNode(
        this.context,
        "gemini-capture"
      );

      this.silent = this.context.createGain();
      this.silent.gain.value = 0;

      this.microphone.connect(this.capture);
      this.capture.connect(this.silent);
      this.silent.connect(this.context.destination);

      const url = new URL(
        "/chat/live",
        window.location.origin
      );

      url.protocol =
        window.location.protocol === "https:"
          ? "wss:"
          : "ws:";

      this.socket = new WebSocket(url);
      this.socket.binaryType = "arraybuffer";

      this.timer = window.setTimeout(() => {
        this.fail(
          "Live voice did not connect. Check the Python server and Vite WebSocket proxy."
        );
      }, 30000);

      this.socket.onopen = () => {
        this.send({
          type: "start",
          language,
        });
      };

      this.socket.onerror = () => {
        this.fail(
          "WebSocket connection failed. Check the Python terminal."
        );
      };

      this.socket.onclose = () => {
        if (!this.closed) {
          this.stop(
            "Connection ended. Reconnect to start a new conversation."
          );
        }
      };

      this.socket.onmessage = (event) => {
        if (this.closed) {
          return;
        }

        try {
          if (event.data instanceof ArrayBuffer) {
            this.play(event.data);
            return;
          }

          const message = JSON.parse(event.data);

          if (message.type === "ready") {
            window.clearTimeout(this.timer);

            this.ready = true;

            this.capture.port.postMessage({
              enabled: !this.muted,
            });
          } else if (message.type === "interrupted") {
            this.clearPlayback();
          } else if (message.type === "error") {
            this.fail(message.text);
            return;
          }

          this.callbacks.onEvent(message);
        } catch (error) {
          this.fail(
            error.message || "Could not process live audio."
          );
        }
      };

      this.capture.port.onmessage = (event) => {
        if (
          this.closed ||
          !this.ready ||
          this.muted
        ) {
          return;
        }

        if (this.socket.readyState !== WebSocket.OPEN) {
          return;
        }

        if (this.socket.bufferedAmount > 64000) {
          this.fail(
            "Your connection is too slow for live audio. Please reconnect."
          );

          return;
        }

        this.socket.send(event.data);
      };
    } catch (error) {
      if (!this.closed) {
        this.fail(
          error.name === "NotAllowedError"
            ? "Allow microphone access, then connect again."
            : error.message || "Could not start live voice."
        );
      }
    }
  }

  send(event) {
    if (
      !this.closed &&
      this.socket?.readyState === WebSocket.OPEN
    ) {
      this.socket.send(JSON.stringify(event));
      return true;
    }

    return false;
  }

  setMuted(muted) {
    this.muted = muted;

    this.stream?.getAudioTracks().forEach((track) => {
      track.enabled = !muted;
    });

    this.capture?.port.postMessage({
      enabled: this.ready && !muted,
    });

    if (muted && this.ready) {
      this.send({
        type: "audio_end",
      });
    }
  }

  play(bytes) {
    if (bytes.byteLength % 2) {
      throw new Error("Invalid reply audio.");
    }

    if (this.context.state !== "running") {
      throw new Error(
        "Audio playback was suspended. End the call and connect again."
      );
    }

    const samples = new DataView(bytes);

    const buffer = this.context.createBuffer(
      1,
      bytes.byteLength / 2,
      24000
    );

    const channel = buffer.getChannelData(0);

    for (let i = 0; i < channel.length; i += 1) {
      channel[i] =
        samples.getInt16(i * 2, true) / 32768;
    }

    const source = this.context.createBufferSource();

    source.buffer = buffer;
    source.connect(this.context.destination);

    const start = Math.max(
      this.nextTime,
      this.context.currentTime + 0.04
    );

    if (start - this.context.currentTime > 30) {
      throw new Error(
        "Voice playback fell behind. Please reconnect."
      );
    }

    this.nextTime = start + buffer.duration;
    this.sources.add(source);

    source.onended = () => {
      source.disconnect();
      this.sources.delete(source);

      if (!this.sources.size && !this.closed) {
        this.callbacks.onPlayback(false);
      }
    };

    source.start(start);
    this.callbacks.onPlayback(true);
  }

  clearPlayback() {
    for (const source of this.sources) {
      source.onended = null;

      try {
        source.stop();
      } catch {
        // The audio source may already have stopped.
      }

      source.disconnect();
    }

    this.sources.clear();
    this.nextTime = 0;

    if (!this.closed) {
      this.callbacks.onPlayback(false);
    }
  }

  fail(message) {
    if (this.closed) {
      return;
    }

    this.callbacks.onError(message);
    this.stop();
  }

  stop(message = "Call ended.") {
    if (this.closed) {
      return;
    }

    this.send({
      type: "stop",
    });

    this.closed = true;
    this.ready = false;

    window.clearTimeout(this.timer);

    this.clearPlayback();

    if (this.capture) {
      this.capture.port.onmessage = null;
    }

    this.capture?.disconnect();
    this.microphone?.disconnect();
    this.silent?.disconnect();

    this.stream?.getTracks().forEach((track) => {
      track.stop();
    });

    if (this.socket) {
      this.socket.onopen = null;
      this.socket.onmessage = null;
      this.socket.onerror = null;
      this.socket.onclose = null;

      this.socket.close();
    }

    if (
      this.context &&
      this.context.state !== "closed"
    ) {
      this.context.close().catch(() => {});
    }

    this.callbacks.onClose(message);
  }
}
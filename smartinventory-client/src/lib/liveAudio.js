export class LiveAudio {
  constructor({
    onEvent,
    onPhase,
    onError,
    provider = "groq",
  }) {
    this.onEvent = onEvent;
    this.onPhase = onPhase;
    this.onError = onError;
    this.provider = provider;

    this.sources = new Set();

    this.stopped = false;
    this.turnComplete = true;
    this.toolBusy = false;
    this.processing = false;
    this.userSpeaking = false;

    this.nextTime = 0;
  }

  phase() {
    if (this.stopped) {
      return;
    }

    this.onPhase(
      this.userSpeaking
        ? "listening"
        : this.sources.size
          ? "speaking"
          : this.toolBusy ||
              this.processing ||
              !this.turnComplete
            ? "thinking"
            : "listening"
    );
  }

  clearPlayback() {
    for (const source of this.sources) {
      source.onended = null;
      source.stop();
      source.disconnect();
    }

    this.sources.clear();
    this.nextTime = 0;
  }

  play(packet) {
    if (this.stopped || !packet.byteLength) {
      return;
    }

    if (packet.byteLength % 2) {
      throw new Error("Invalid reply audio.");
    }

    const context = this.context;

    if (this.nextTime - context.currentTime > 30) {
      throw new Error(
        "Playback fell behind. End live and start again."
      );
    }

    const data = new DataView(packet);

    const buffer = context.createBuffer(
      1,
      packet.byteLength / 2,
      24000
    );

    const output = buffer.getChannelData(0);

    for (let i = 0; i < output.length; i++) {
      output[i] =
        data.getInt16(i * 2, true) / 32768;
    }

    const source = context.createBufferSource();

    source.buffer = buffer;
    source.connect(context.destination);

    source.onended = () => {
      source.disconnect();
      this.sources.delete(source);
      this.phase();
    };

    this.sources.add(source);

    this.nextTime = Math.max(
      this.nextTime,
      context.currentTime + 0.06
    );

    source.start(this.nextTime);

    this.nextTime += buffer.duration;
    this.turnComplete = false;

    this.phase();
  }

  fail(message) {
    if (this.stopped) {
      return;
    }

    this.onError(message);
    this.stop();
  }

  async start(language) {
    try {
      if (
        !navigator.mediaDevices?.getUserMedia ||
        !window.AudioWorkletNode
      ) {
        throw new Error(
          "Use Chrome or Edge on localhost or HTTPS for live microphone audio."
        );
      }

      this.onPhase("connecting");

      const Context =
        window.AudioContext ||
        window.webkitAudioContext;

      this.context = new Context(
        this.provider === "groq"
          ? { sampleRate: 48000 }
          : undefined
      );

      if (
        this.provider === "groq" &&
        ![8000, 16000, 32000, 48000].includes(
          this.context.sampleRate
        )
      ) {
        throw new Error(
          "This browser cannot provide the microphone sample rate needed for Groq voice. Try Chrome or Edge."
        );
      }

      // Resume during the user's click.
      await this.context.resume();

      if (this.stopped) {
        return;
      }

      const stream =
        await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });

      if (this.stopped) {
        stream.getTracks().forEach((track) => {
          track.stop();
        });

        return;
      }

      this.stream = stream;

      await this.context.audioWorklet.addModule(
        `${import.meta.env.BASE_URL}audio/pcm-capture.js`
      );

      if (this.stopped) {
        return;
      }

      this.capture = new AudioWorkletNode(
        this.context,
        "pcm-capture",
        {
          channelCount: 1,
          channelCountMode: "explicit",
          numberOfInputs: 1,
          numberOfOutputs: 1,
        }
      );

      this.microphone =
        this.context.createMediaStreamSource(stream);

      const endpoint =
        this.provider === "gemini"
          ? "/agent/live"
          : "/agent/voice/groq";

      const url = new URL(
        endpoint,
        window.location.href
      );

      url.protocol =
        url.protocol === "https:" ? "wss:" : "ws:";

      this.socket = new WebSocket(url);
      this.socket.binaryType = "arraybuffer";

      this.timer = setTimeout(() => {
        this.fail(
          "Live connection timed out. Check Python and the Vite WebSocket proxy."
        );
      }, 20000);

      this.socket.onopen = () => {
        this.socket.send(
          JSON.stringify({
            type: "start",
            language,
            sample_rate: this.context.sampleRate,
          })
        );
      };

      this.capture.port.onmessage = (event) => {
        if (
          this.stopped ||
          !this.ready ||
          this.socket.readyState !== WebSocket.OPEN
        ) {
          return;
        }

        if (this.socket.bufferedAmount > 256000) {
          this.fail(
            "The audio connection is too slow. Start a new session when it improves."
          );

          return;
        }

        this.socket.send(event.data);
      };

      this.socket.onmessage = (event) => {
        if (this.stopped) {
          return;
        }

        try {
          if (event.data instanceof ArrayBuffer) {
            this.play(event.data);
            return;
          }

          const message = JSON.parse(event.data);

          if (message.type === "ready") {
            clearTimeout(this.timer);

            this.ready = true;

            this.microphone.connect(this.capture);

            this.capture.connect(
              this.context.destination
            );
          } else if (
            message.type === "interrupted"
          ) {
            this.clearPlayback();
            this.turnComplete = true;
          } else if (
            message.type === "turn_complete"
          ) {
            this.turnComplete = true;
          } else if (
            message.type === "tool_started"
          ) {
            this.toolBusy = true;
          } else if (
            message.type === "tool_finished"
          ) {
            this.toolBusy = false;
          } else if (
            message.type === "processing_started"
          ) {
            this.processing = true;
          } else if (
            message.type === "processing_finished"
          ) {
            this.processing = false;
          } else if (
            message.type === "user_speaking"
          ) {
            this.userSpeaking =
              message.active === true;
          } else if (message.type === "error") {
            this.fail(message.message);
            return;
          }

          this.onEvent(message);
          this.phase();
        } catch (error) {
          this.fail(
            error.message ||
              "Could not read the live reply."
          );
        }
      };

      this.socket.onerror = () => {
        this.fail(
          "Cannot connect to live voice. Check the Python server and /agent proxy."
        );
      };

      this.socket.onclose = () => {
        if (this.stopped) {
          return;
        }

        this.onEvent({
          type: "notice",
          message:
            "Live session ended. Start live again to continue.",
        });

        this.stop();
      };

      this.context.onstatechange = () => {
        if (
          !this.stopped &&
          this.ready &&
          this.context.state === "suspended"
        ) {
          this.fail(
            "Audio was paused by the browser. Start live again."
          );
        }
      };

      stream.getTracks().forEach((track) => {
        track.onended = () => {
          this.fail("Microphone disconnected.");
        };
      });
    } catch (error) {
      this.fail(
        error.name === "NotAllowedError"
          ? "Allow microphone access to start live voice."
          : error.message
      );
    }
  }

  stop() {
    if (this.stopped) {
      return;
    }

    this.stopped = true;

    clearTimeout(this.timer);
    this.clearPlayback();

    if (this.capture) {
      this.capture.port.onmessage = null;
      this.capture.disconnect();
      this.capture.port.close();
    }

    this.microphone?.disconnect();

    this.stream?.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });

    if (this.socket) {
      this.socket.onopen = null;
      this.socket.onmessage = null;
      this.socket.onerror = null;
      this.socket.onclose = null;

      if (
        this.socket.readyState === WebSocket.OPEN
      ) {
        this.socket.send(
          JSON.stringify({
            type: "stop",
          })
        );
      }

      this.socket.close();
    }

    if (this.context) {
      this.context.onstatechange = null;

      void this.context.close().catch(() => {});
    }

    if (this.toolBusy) {
      this.onEvent({
        type: "notice",
        message:
          "An inventory request was submitted. Ending audio does not cancel it; refresh Inventory before repeating it.",
      });
    }

    this.onPhase("idle");
  }
}
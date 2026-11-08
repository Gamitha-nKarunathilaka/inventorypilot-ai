/* global AudioWorkletProcessor, registerProcessor, sampleRate */

class GeminiCapture extends AudioWorkletProcessor {
  constructor() {
    super();

    this.enabled = false;
    this.ratio = sampleRate / 16000;

    this.reset();

    this.port.onmessage = (event) => {
      this.enabled = event.data.enabled === true;
      this.reset();
    };
  }

  reset() {
    this.remaining = this.ratio;
    this.sum = 0;

    this.buffer = new ArrayBuffer(640);
    this.view = new DataView(this.buffer);

    this.position = 0;
  }

  process(inputs) {
    const channel = inputs[0]?.[0];

    if (!this.enabled || !channel) {
      return true;
    }

    // Keep fractional positions between audio blocks.
    for (const value of channel) {
      let available = 1;

      while (available > 1e-8) {
        const weight = Math.min(
          available,
          this.remaining
        );

        this.sum += value * weight;
        this.remaining -= weight;
        available -= weight;

        if (this.remaining <= 1e-8) {
          const sample = Math.max(
            -1,
            Math.min(1, this.sum / this.ratio)
          );

          this.view.setInt16(
            this.position * 2,
            Math.round(
              sample * (sample < 0 ? 32768 : 32767)
            ),
            true
          );

          this.position += 1;
          this.sum = 0;
          this.remaining = this.ratio;

          if (this.position === 320) {
            this.port.postMessage(
              this.buffer,
              [this.buffer]
            );

            this.buffer = new ArrayBuffer(640);
            this.view = new DataView(this.buffer);
            this.position = 0;
          }
        }
      }
    }

    return true;
  }
}

registerProcessor(
  "gemini-capture",
  GeminiCapture
);
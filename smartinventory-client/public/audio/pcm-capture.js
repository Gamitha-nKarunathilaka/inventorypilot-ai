class PCMCapture extends AudioWorkletProcessor {
  constructor() {
    super();

    this.packet = new ArrayBuffer(4096);
    this.view = new DataView(this.packet);
    this.offset = 0;
  }

  process(inputs) {
    const channel = inputs[0]?.[0];

    if (!channel) {
      return true;
    }

    for (const value of channel) {
      const sample = Math.max(
        -1,
        Math.min(1, value)
      );

      this.view.setInt16(
        this.offset,
        sample * (sample < 0 ? 32768 : 32767),
        true
      );

      this.offset += 2;

      if (this.offset === this.packet.byteLength) {
        this.port.postMessage(
          this.packet,
          [this.packet]
        );

        this.packet = new ArrayBuffer(4096);
        this.view = new DataView(this.packet);
        this.offset = 0;
      }
    }

    // Keep the output silent.
    return true;
  }
}

registerProcessor("pcm-capture", PCMCapture);
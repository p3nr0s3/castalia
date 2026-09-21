/**
 * In-line streaming parser for models that emit reasoning inside `<think>...</think>` tags
 * (e.g. DeepSeek-R1, QwQ, Marco-o1) within their content stream.
 *
 * It decouples thought generation from final assistant response tokens in real-time,
 * routing thoughts to `onReasoning` and response tokens to `onToken`, even when tags
 * are split across arbitrary network streaming chunks.
 */

export class ReasoningStreamParser {
  private inThink: boolean = false;
  private pending: string = "";

  /**
   * Processes an incoming text chunk from the model stream.
   */
  public processChunk(
    chunk: string,
    callbacks: {
      onToken: (token: string) => void;
      onReasoning: (reasoning: string) => void;
    }
  ): void {
    let text = this.pending + chunk;
    this.pending = "";

    while (text.length > 0) {
      if (!this.inThink) {
        const thinkIndex = text.indexOf("<think>");
        if (thinkIndex === -1) {
          // Check if the tail contains a partial prefix of "<think>" (length 1 to 6)
          let partialMatched = false;
          for (let len = Math.min(6, text.length); len >= 1; len--) {
            const tail = text.slice(text.length - len);
            if ("<think>".startsWith(tail)) {
              this.pending = tail;
              const ready = text.slice(0, text.length - len);
              if (ready) callbacks.onToken(ready);
              partialMatched = true;
              break;
            }
          }
          if (!partialMatched) {
            callbacks.onToken(text);
          }
          break;
        } else {
          // Text before <think> is normal content
          const before = text.slice(0, thinkIndex);
          if (before) callbacks.onToken(before);
          this.inThink = true;
          text = text.slice(thinkIndex + 7);
        }
      } else {
        // We are currently inside <think>
        const endThinkIndex = text.indexOf("</think>");
        if (endThinkIndex === -1) {
          // Check if the tail contains a partial prefix of "</think>" (length 1 to 7)
          let partialMatched = false;
          for (let len = Math.min(7, text.length); len >= 1; len--) {
            const tail = text.slice(text.length - len);
            if ("</think>".startsWith(tail)) {
              this.pending = tail;
              const ready = text.slice(0, text.length - len);
              if (ready) callbacks.onReasoning(ready);
              partialMatched = true;
              break;
            }
          }
          if (!partialMatched) {
            callbacks.onReasoning(text);
          }
          break;
        } else {
          // Reached the end of the <think> block
          const inside = text.slice(0, endThinkIndex);
          if (inside) callbacks.onReasoning(inside);
          this.inThink = false;
          text = text.slice(endThinkIndex + 8);
          // Strip a single immediate leading newline right after </think> if present
          if (text.startsWith("\r\n")) {
            text = text.slice(2);
          } else if (text.startsWith("\n")) {
            text = text.slice(1);
          }
        }
      }
    }
  }

  /**
   * Emits any remaining buffered characters at the end of the stream.
   */
  public flush(callbacks: {
    onToken: (token: string) => void;
    onReasoning: (reasoning: string) => void;
  }): void {
    if (this.pending) {
      if (this.inThink) {
        callbacks.onReasoning(this.pending);
      } else {
        callbacks.onToken(this.pending);
      }
      this.pending = "";
    }
  }

  public isInThink(): boolean {
    return this.inThink;
  }
}

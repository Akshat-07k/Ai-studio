export function HowItWorks() {
  return (
    <section className="panel">
      <h2>How it works</h2>
      <div className="arch">
        <div className="arch-box">
          <strong>This page</strong>
          <span className="muted small">Next.js · port 3000</span>
          <p className="small">The interface you click on, running in your browser.</p>
        </div>
        <div className="arch-arrow">→</div>
        <div className="arch-box">
          <strong>Backend</strong>
          <span className="muted small">Node.js + Express · port 4000</span>
          <p className="small">Starts and stops the engines, builds requests, streams progress back, saves history.</p>
        </div>
        <div className="arch-arrow">→</div>
        <div className="arch-stack">
          <div className="arch-box">
            <strong>ComfyUI</strong>
            <span className="muted small">Python · port 8188 / 8190</span>
            <p className="small">Runs SDXL. Gets a node graph (as JSON) and returns images.</p>
          </div>
          <div className="arch-box">
            <strong>llama-server</strong>
            <span className="muted small">llama.cpp · port 8080</span>
            <p className="small">Runs the .gguf chat model. Speaks the same API format as OpenAI.</p>
          </div>
        </div>
      </div>
      <ul className="how-list">
        <li>Everything stays on this PC: no cloud services, no accounts, works offline.</li>
        <li>
          Images are saved to ComfyUI&apos;s output folder (<code>output/Interface</code>). Chats and settings are
          saved in <code>Interface/backend/data</code>.
        </li>
        <li>
          Both engines run without their own UIs: ComfyUI&apos;s node editor and llama.cpp&apos;s web chat are never
          opened.
        </li>
      </ul>
    </section>
  );
}
